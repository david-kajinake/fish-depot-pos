import logging
from celery import shared_task
from api.models import Customer
from api.utils.generate_statement import StatementGenerator
from django.core.mail import EmailMessage
"""
tasks that might be too heavy for processing 
therefore are set to be run by celery asynchronously in the background
"""

logger = logging.getLogger(__name__)

@shared_task
def generate_and_email_customer_statement(customer_id, recipient_email, start_date=None, end_date=None):
    try:
        customer = Customer.objects.get(pk=customer_id)
        generator = StatementGenerator()
        
        # Generates PDF using either all-time or filtered date range
        pdf_stream = generator.generate_customer_sales_statement(
            customer_object=customer, 
            start_date=start_date, 
            end_date=end_date
        )

        # Send via email asynchronously
        message = EmailMessage(
            subject=f'Fresh Victoria Fish — Customer Sales Statement: {customer.name}',
            body=f'Please find attached the sales statement for {customer.name}.',
            to=[recipient_email],
        )
        message.attach(f'{customer.name}-sales-statement.pdf', pdf_stream.read(), 'application/pdf')
        message.send(fail_silently=False)
        return f"Statement successfully generated and emailed to {recipient_email}"
    except Exception as e:
        return f"Error generating statement: {str(e)}"


