"""Celery tasks for generating and emailing statement PDFs."""

from celery import shared_task
from django.core.mail import EmailMessage

from api.models import Customer, Supplier, Sale, SaleItem, Day, FishSize, Spoilage, SystemSetting
from django.utils import timezone
from decimal import Decimal
from api.utils.generate_statement import StatementGenerator
from api.utils.updates import Update



def _send_statement(email, subject, filename, pdf_stream):
    message = EmailMessage(subject=subject, body='Please find the requested statement attached.', to=[email])
    message.attach(filename, pdf_stream.read(), 'application/pdf')
    message.send(fail_silently=False)
    return f'Statement successfully emailed to {email}'

@shared_task
def notify_multiple_invalid_login_attempts(contact_to_notify, client_ip, attempts):
    """Send a batched suspicious-login alert containing all 3 failed attempts."""
    return Update().notify_multiple_invalid_login_attempts(contact_to_notify, client_ip, attempts)


@shared_task
def generate_and_email_customer_statement(customer_id, recipient_email, start_date=None, end_date=None, generated_by=None):
    customer = Customer.objects.get(pk=customer_id)
    pdf = StatementGenerator(generated_by=generated_by).generate_customer_sales_statement(customer, start_date, end_date)
    return _send_statement(recipient_email, f'Fresh Victoria Fish - Customer Sales Statement: {customer.name}', f'{customer.name}-sales-statement.pdf', pdf)


@shared_task
def generate_and_email_supplier_statement(supplier_id, recipient_email, start_date=None, end_date=None, generated_by=None):
    supplier = Supplier.objects.get(pk=supplier_id)
    pdf = StatementGenerator(generated_by=generated_by).generate_supplier_stock_supply_statement(supplier, start_date, end_date)
    return _send_statement(recipient_email, f'Fresh Victoria Fish - Supplier Statement: {supplier.name}', f'{supplier.name}-supply-statement.pdf', pdf)


@shared_task
def generate_and_email_all_suppliers_statement(recipient_email, start_date=None, end_date=None, generated_by=None):
    pdf = StatementGenerator(generated_by=generated_by).generate_stock_supply_statement(start_date, end_date)
    return _send_statement(recipient_email, 'Fresh Victoria Fish - All Stock Supplies Statement', 'all-stock-supplies-statement.pdf', pdf)


@shared_task
def generate_and_email_sales_statement(recipient_email, start_date=None, end_date=None, generated_by=None):
    pdf = StatementGenerator(generated_by=generated_by).generate_sales_statement(start_date, end_date)
    return _send_statement(recipient_email, 'Fresh Victoria Fish - Sales Statement', 'sales-statement.pdf', pdf)


@shared_task
def genrate_and_email_single_expense_statement(expense_name, recipient_email, start_date=None, end_date=None, generated_by=None):
    pdf = StatementGenerator(generated_by=generated_by).generate_single_expenses_statement(expense_name, start_date, end_date)
    return _send_statement(recipient_email, f'Fresh Victoria Fish - Expense Statement: {expense_name}', f'{expense_name}-expense-statement.pdf', pdf)


@shared_task
def generate_and_email_all_expenses_statement(recipient_email, start_date=None, end_date=None, generated_by=None):
    pdf = StatementGenerator(generated_by=generated_by).generate_all_expenses_statement(start_date, end_date)
    return _send_statement(recipient_email, 'Fresh Victoria Fish - All Expenses Statement', 'all-expenses-statement.pdf', pdf)


def _is_targeted(setting, prefix, customer_id):
    if not getattr(setting, f'{prefix}_auto_send'):
        return False
    if getattr(setting, f'{prefix}_target') == 'all':
        return True
    return str(customer_id) in {str(pk) for pk in getattr(setting, f'{prefix}_selected_customers')}


@shared_task
def send_automated_receipt(sale_id):
    sale = Sale.objects.select_related('customer', 'cashier', 'day').prefetch_related('items__fish_size').get(pk=sale_id)
    setting = SystemSetting.load()
    if not sale.customer or not sale.customer.email or not _is_targeted(setting, 'receipt', sale.customer_id):
        return 'Receipt not applicable.'
    pdf = StatementGenerator(generated_by='System automation')._generate_record_cards('Sale receipt', f'Sale #{sale.id}', [sale], 'sale')
    return _send_statement(sale.customer.email, 'Fresh Victoria Fish - Sale Receipt', f'receipt-{sale.id}.pdf', pdf)


@shared_task
def send_automated_bill(sale_id):
    sale = Sale.objects.select_related('customer', 'cashier', 'day').prefetch_related('items__fish_size').get(pk=sale_id)
    setting = SystemSetting.load()
    if not sale.customer or not sale.customer.email or not _is_targeted(setting, 'bill', sale.customer_id):
        return 'Bill not applicable.'
    pdf = StatementGenerator(generated_by='System automation').generate_sale_bill(sale)
    message = EmailMessage(subject='Fresh Victoria Fish - Customer Bill', body='Please find your itemized bill attached.', to=[sale.customer.email])
    message.attach(f'bill-{sale.id}.pdf', pdf.read(), 'application/pdf')
    message.send(fail_silently=False)
    return f'Bill emailed to {sale.customer.email}'


@shared_task
def run_scheduled_automations():
    """Celery Beat entry point; safe to run once per minute."""
    setting = SystemSetting.load()
    now = timezone.localtime()
    today = now.date()
    current_time = now.time().replace(second=0, microsecond=0)
    if setting.statement_auto_send and setting.statement_method == 'email' and setting.statement_time and setting.statement_time.replace(second=0, microsecond=0) == current_time and setting.last_statement_dispatch_date != today:
        for email in (contact for contact in setting.statement_contacts if '@' in str(contact)):
            generate_and_email_full_day_statement.delay(str(today), email)
        setting.last_statement_dispatch_date = today
        setting.save(update_fields=['last_statement_dispatch_date'])
    if setting.auto_close_day and setting.auto_close_time and setting.auto_close_time.replace(second=0, microsecond=0) == current_time and setting.last_auto_close_date != today:
        close_day_automatically.delay(str(today))
        setting.last_auto_close_date = today
        setting.save(update_fields=['last_auto_close_date'])


@shared_task
def close_day_automatically(day_value):
    day = Day.objects.filter(date=day_value, is_closed=False).first()
    if not day:
        return 'No open day to close.'
    sales = sum((sale.total_amount for sale in day.sales.all()), Decimal('0.00'))
    supplies = sum((invoice.total_invoice_cost for invoice in day.supply_invoices.all()), Decimal('0.00'))
    day.closing_balance = day.opening_balance + sales - supplies
    day.is_closed = True
    day.save(update_fields=['closing_balance', 'is_closed'])
    return f'Closed {day.date}'


@shared_task(bind=True, autoretry_for=(Exception,), retry_backoff=True, retry_jitter=True, max_retries=3)
def generate_and_email_full_day_statement(self, day_value, recipient_email):
    day = Day.objects.get(date=day_value)
    sales = sum((sale.total_amount for sale in day.sales.all()), Decimal('0.00'))
    supplies = sum((invoice.total_invoice_cost for invoice in day.supply_invoices.all()), Decimal('0.00'))
    expenses = sum((expense.amount for expense in day.expenses.all()), Decimal('0.00'))
    spoilages = Spoilage.objects.filter(day_recorded=day.date).select_related('fish_size')
    spoilage_weight = sum((entry.weight for entry in spoilages), Decimal('0.00'))
    spoilage_cost = sum((entry.weight * entry.fish_size.buying_price_per_kg for entry in spoilages), Decimal('0.00'))
    closing_stock = sum((fish.current_stock_kg for fish in FishSize.objects.all()), Decimal('0.00'))
    supplied_weight = sum((invoice.total_weight for invoice in day.supply_invoices.all()), Decimal('0.00'))
    sold_weight = sum((item.weight for item in SaleItem.objects.filter(sale__day=day)), Decimal('0.00'))
    opening_stock = closing_stock - supplied_weight + sold_weight + spoilage_weight
    outstanding_debt = sum((customer.debt_balance for customer in Customer.objects.all()), Decimal('0.00'))
    lines = [f'Full-Day Statement — {day.date}', f'Total supply amount: KES {supplies:.2f}', f'Total supply weight: {supplied_weight:.2f} kg', f'Total expenses: KES {expenses:.2f}', f'Opening stock weight: {opening_stock:.2f} kg', f'Closing stock weight: {closing_stock:.2f} kg', f'Total sales: KES {sales:.2f}', f'Spoilages recorded: {spoilage_weight:.2f} kg', f'Outstanding customer debt: KES {outstanding_debt:.2f}', f'Net profit / loss: KES {sales - expenses - supplies - spoilage_cost:.2f}']
    pdf = StatementGenerator(generated_by='System automation').generate_full_day_statement(day, lines)
    message = EmailMessage(subject=f'Fresh Victoria Fish - Full-Day Statement {day.date}', body='\n'.join(lines), to=[recipient_email])
    message.attach(f'full-day-statement-{day.date}.pdf', pdf.read(), 'application/pdf')
    message.send(fail_silently=False)
    return f'Full-day statement emailed to {recipient_email}'
