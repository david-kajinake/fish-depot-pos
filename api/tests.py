from decimal import Decimal
from unittest.mock import patch

from django.core import mail
from django.test import TestCase, override_settings
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from .models import Customer, Day, Expense, FishSize, LoginAttempt, OutsideFrying, Supplier, SupplyInvoice, User
from .tasks import notify_invalid_login_attempt
from .utils.generate_statement import StatementGenerator


class CustomerDebtFlowTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username='cashier', password='secret-pass', name='Cashier',
            can_generate_statements=True,
            can_record_customer_balance_debt_payment=True,
        )
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def test_sale_creates_named_customer_and_adds_only_unpaid_balance(self):
        FishSize.objects.create(name='1', current_stock_kg=Decimal('20'), current_stock_qty=20,
                                buying_price_per_kg=Decimal('100'), retail_price_per_kg=Decimal('200'),
                                wholesale_price_per_kg=Decimal('180'))
        response = self.client.post('/api/sales/', {
            'customer_name': 'Amina', 'total_amount': '1000.00', 'amount_paid_now': '400.00',
            'items': [{'fish_size': '1', 'weight': '5.00', 'quantity': 5, 'rate_charged': '200.00',
                       'is_fried': False, 'frying_fee_applied': '0.00'}]
        }, format='json')
        self.assertEqual(response.status_code, 201)
        self.assertEqual(Customer.objects.get(name='Amina').debt_balance, Decimal('600.00'))

    def test_overpayment_settles_existing_debt_after_the_current_sale(self):
        customer = Customer.objects.create(name='Amina', debt_balance=Decimal('1200.00'))
        FishSize.objects.create(name='1', current_stock_kg=Decimal('20'), current_stock_qty=20,
                                buying_price_per_kg=Decimal('100'), retail_price_per_kg=Decimal('200'),
                                wholesale_price_per_kg=Decimal('180'))
        response = self.client.post('/api/sales/', {
            'customer': customer.id, 'total_amount': '1.00', 'amount_paid_now': '1400.00',
            'items': [{'fish_size': '1', 'weight': '5.00', 'quantity': 5, 'rate_charged': '200.00',
                       'is_fried': False, 'frying_fee_applied': '0.00'}]
        }, format='json')
        self.assertEqual(response.status_code, 201)
        customer.refresh_from_db()
        self.assertEqual(customer.debt_balance, Decimal('800.00'))

    def test_frying_fee_is_included_and_insufficient_stock_rejects_entire_sale(self):
        customer = Customer.objects.create(name='Amina')
        fish_size = FishSize.objects.create(name='1', current_stock_kg=Decimal('5'), current_stock_qty=5,
                                            buying_price_per_kg=Decimal('100'), retail_price_per_kg=Decimal('200'),
                                            wholesale_price_per_kg=Decimal('180'))
        payload = {
            'customer': customer.id, 'total_amount': '1.00', 'amount_paid_now': '1050.00',
            'items': [{'fish_size': '1', 'weight': '5.00', 'quantity': 5, 'rate_charged': '200.00',
                       'is_fried': True, 'frying_fee_applied': '50.00'}]
        }
        accepted = self.client.post('/api/sales/', payload, format='json')
        self.assertEqual(accepted.status_code, 201)
        self.assertEqual(Decimal(accepted.data['total_amount']), Decimal('1050.00'))

        payload['amount_paid_now'] = '1000.00'
        rejected = self.client.post('/api/sales/', payload, format='json')
        self.assertEqual(rejected.status_code, 400)
        fish_size.refresh_from_db()
        self.assertEqual(fish_size.current_stock_kg, Decimal('0.00'))
        self.assertEqual(fish_size.current_stock_qty, 0)

    def test_balance_payment_reduces_debt(self):
        customer = Customer.objects.create(name='Amina', debt_balance=Decimal('600.00'))
        response = self.client.post(f'/api/customers/{customer.id}/record-balance-payment/', {'amount': '250.00'}, format='json')
        self.assertEqual(response.status_code, 200)
        customer.refresh_from_db()
        self.assertEqual(customer.debt_balance, Decimal('350.00'))

    def test_day_ledger_includes_outside_frying_entries(self):
        day = Day.objects.create(date='2026-10-06')
        OutsideFrying.objects.create(day=day, source='Lake harvest', quantity=4, total_fee=Decimal('300.00'))
        response = self.client.get('/api/days/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data[0]['outside_fryings'][0]['source'], 'Lake harvest')
        self.assertEqual(Decimal(response.data[0]['outside_fryings'][0]['total_fee']), Decimal('300.00'))

    def test_statement_generator_returns_a_pdf(self):
        statement = StatementGenerator().generate_balance_history(Customer.objects.create(name='Amina'))
        self.assertTrue(statement.read().startswith(b'%PDF'))

    def test_operational_statement_generators_return_pdfs(self):
        day = Day.objects.create(date='2026-10-19')
        supplier = Supplier.objects.create(name='Lake Supplier')
        SupplyInvoice.objects.create(day=day, supplier=supplier, total_invoice_cost=Decimal('200.00'), total_weight=Decimal('10.00'), amount_paid_to_supplier=Decimal('100.00'))
        Expense.objects.create(day=day, item_name='Ice', amount=Decimal('50.00'))
        generator = StatementGenerator()
        statements = [
            generator.generate_sales_statement(),
            generator.generate_supplier_stock_supply_statement(supplier),
            generator.generate_stock_supply_statement(),
            generator.generate_single_expenses_statement('Ice'),
            generator.generate_all_expenses_statement(),
        ]
        self.assertTrue(all(statement.read().startswith(b'%PDF') for statement in statements))

    def test_jwt_login_identity_and_logout_are_bound_to_the_same_user(self):
        response = APIClient().post('/api/auth/login/', {'username': 'cashier', 'password': 'secret-pass'}, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['user']['username'], 'cashier')
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.data['access']}")
        self.assertEqual(client.get('/api/auth/me/').data['username'], 'cashier')
        logout = client.post('/api/auth/logout/', {'refresh': response.data['refresh']}, format='json')
        self.assertEqual(logout.status_code, 204)
        self.assertFalse(APIClient().post('/api/auth/refresh/', {'refresh': response.data['refresh']}, format='json').status_code == 200)

    @override_settings(EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend')
    def test_statement_requires_current_password_and_sends_after_confirmation(self):
        customer = Customer.objects.create(name='Amina')
        rejected = self.client.post(f'/api/customers/{customer.id}/send-statement/', {'email': 'a@example.com', 'password': 'wrong'}, format='json')
        self.assertEqual(rejected.status_code, 400)
        response = self.client.post(f'/api/customers/{customer.id}/send-statement/', {'email': 'a@example.com', 'password': 'secret-pass'}, format='json')
        self.assertEqual(response.status_code, 200)


@override_settings(EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend')
class LoginAttemptAlertTests(TestCase):
    def setUp(self):
        User.objects.create_user(username='admin', password='admin-password', email='admin@example.com')
        self.client = APIClient()
        self.payload = {'username': 'cashier', 'password': 'almost-right'}

    @patch('api.views.tasks.notify_invalid_login_attempt.delay')
    def test_third_consecutive_failure_is_saved_and_queued_for_notification(self, delay):
        self.assertEqual(self.client.post('/api/login-attempts/', self.payload, format='json').status_code, 200)
        self.assertEqual(self.client.post('/api/login-attempts/', self.payload, format='json').status_code, 200)
        response = self.client.post('/api/login-attempts/', self.payload, format='json')

        self.assertEqual(response.status_code, 202)
        self.assertEqual(LoginAttempt.objects.count(), 1)
        attempt = LoginAttempt.objects.get()
        self.assertEqual(attempt.attempts_status, 'FAILED')
        self.assertEqual(response.data['username'], 'cashier')
        self.assertNotIn('password', response.data)
        delay.assert_called_once_with(
            contact_to_notify='admin@example.com', username='cashier', password='almost-right'
        )

    def test_alert_task_sends_html_email_with_attempted_credentials(self):
        notify_invalid_login_attempt.run(
            contact_to_notify='admin@example.com', username='cashier', password='almost-right'
        )
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, ['admin@example.com'])
        self.assertIn('cashier', mail.outbox[0].body)
        self.assertIn('almost-right', mail.outbox[0].body)
        self.assertEqual(mail.outbox[0].alternatives[0][1], 'text/html')
