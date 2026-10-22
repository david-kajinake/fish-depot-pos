"""Celery tasks for generating and emailing statement PDFs."""

from celery import shared_task
from django.core.mail import EmailMessage

from api.models import Customer, Supplier
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
def generate_and_email_single_expense_statement(expense_name, recipient_email, start_date=None, end_date=None, generated_by=None):
    pdf = StatementGenerator(generated_by=generated_by).generate_single_expenses_statement(expense_name, start_date, end_date)
    return _send_statement(recipient_email, f'Fresh Victoria Fish - Expense Statement: {expense_name}', f'{expense_name}-expense-statement.pdf', pdf)


@shared_task
def generate_and_email_all_expenses_statement(recipient_email, start_date=None, end_date=None, generated_by=None):
    pdf = StatementGenerator(generated_by=generated_by).generate_all_expenses_statement(start_date, end_date)
    return _send_statement(recipient_email, 'Fresh Victoria Fish - All Expenses Statement', 'all-expenses-statement.pdf', pdf)
