"""PDF customer balance statements for email attachments or downloads."""
from django.utils.timezone import make_aware
from datetime import datetime
from io import BytesIO
from decimal import Decimal

from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)

from api.models import BalancePayment, Sale


class StatementGenerator:
    """Build a printable balance history without persisting a temporary file."""

    page_width, page_height = A4
    margin = 42

    def generate_balance_history(self, customer_object):
        """Return a PDF ``BytesIO`` stream for ``customer_object``."""
        events = self._events(customer_object)
        current_balance = Decimal(customer_object.debt_balance)
        opening_balance = current_balance - sum(
            (event['sale_amount'] - event['paid_amount'] for event in events),
            Decimal('0.00')
        )

        buffer = BytesIO()
        doc = SimpleDocTemplate(
            buffer,
            pagesize=A4,
            leftMargin=self.margin,
            rightMargin=self.margin,
            topMargin=self.margin,
            bottomMargin=self.margin
        )

        styles = getSampleStyleSheet()

        header_title_style = ParagraphStyle(
            'HeaderTitle',
            parent=styles['Normal'],
            fontName='Helvetica-Bold',
            fontSize=16,
            textColor=colors.white,
            leading=18,
        )
        header_sub_style = ParagraphStyle(
            'HeaderSub',
            parent=styles['Normal'],
            fontName='Helvetica',
            fontSize=9,
            textColor=colors.white,
            leading=11,
        )
        meta_label_style = ParagraphStyle(
            'MetaLabel',
            parent=styles['Normal'],
            fontName='Helvetica-Bold',
            fontSize=10,
            textColor=colors.HexColor('#17324d'),
            leading=13,
        )
        meta_val_style = ParagraphStyle(
            'MetaValue',
            parent=styles['Normal'],
            fontName='Helvetica',
            fontSize=9,
            textColor=colors.HexColor('#64809a'),
            leading=12,
        )

        story = []

        # 1. Header Banner
        banner_data = [
            [Paragraph('<b>FRESH VICTORIA FISH</b>', header_title_style)],
            [Paragraph('Customer balance statement', header_sub_style)]
        ]
        usable_width = self.page_width - (2 * self.margin)
        banner_table = Table(banner_data, colWidths=[usable_width])
        banner_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#00509e')),
            ('TOPPADDING', (0, 0), (-1, -1), 10),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 10),
            ('LEFTPADDING', (0, 0), (-1, -1), 12),
            ('RIGHTPADDING', (0, 0), (-1, -1), 12),
        ]))
        story.append(banner_table)
        story.append(Spacer(1, 14))

        # 2. Customer Metadata
        phone_str = customer_object.phone or '-'
        email_str = customer_object.email or '-'
        meta_data = [
            [Paragraph(f'<b>Customer:</b> {customer_object.name}', meta_label_style)],
            [Paragraph(f'Phone: {phone_str} &nbsp;&nbsp;&nbsp;&nbsp; Email: {email_str}', meta_val_style)],
            [Paragraph(f'Opening balance: <b>{self._money(opening_balance)}</b> &nbsp;&nbsp;&nbsp;&nbsp; Current balance: <b>{self._money(current_balance)}</b>', meta_val_style)]
        ]
        meta_table = Table(meta_data, colWidths=[usable_width])
        meta_table.setStyle(TableStyle([
            ('TOPPADDING', (0, 0), (-1, -1), 2),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
            ('LEFTPADDING', (0, 0), (-1, -1), 0),
            ('RIGHTPADDING', (0, 0), (-1, -1), 0),
        ]))
        story.append(meta_table)
        story.append(Spacer(1, 14))

        # 3. Statement Ledger Table
        headers = ['Date', 'Reference', 'Sale amount', 'Amount paid', 'Balance']
        table_data = [headers]

        running_balance = opening_balance
        if not events:
            table_data.append(['-', 'No sales or balance payments recorded', 'KES 0.00', 'KES 0.00', self._money(current_balance)])
        else:
            for event in events:
                running_balance += event['sale_amount'] - event['paid_amount']
                table_data.append([
                    event['timestamp'].astimezone().strftime('%d %b %Y %H:%M'),
                    event['reference'],
                    self._money(event['sale_amount']),
                    self._money(event['paid_amount']),
                    self._money(running_balance)
                ])

        col_widths = [110, 140, 85, 85, 91.27]
        statement_table = Table(table_data, colWidths=col_widths, repeatRows=1)
        statement_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#edf8ff')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.HexColor('#00509e')),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 8),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
            ('TOPPADDING', (0, 0), (-1, -1), 6),
            ('ALIGN', (2, 0), (-1, -1), 'RIGHT'),
            ('LINEBELOW', (0, 0), (-1, -1), 0.5, colors.HexColor('#d8e8f2')),
        ]))
        story.append(statement_table)

        doc.build(story)
        buffer.seek(0)
        return buffer

    def _events(self, customer):
        events = []
        for sale in Sale.objects.filter(customer=customer).order_by('timestamp', 'id'):
            events.append({
                'timestamp': sale.timestamp,
                'reference': f'Sale #{sale.id[:8]}',
                'sale_amount': Decimal(sale.total_amount),
                'paid_amount': Decimal(sale.amount_paid_now)
            })
        for payment in BalancePayment.objects.filter(customer=customer).order_by('timestamp', 'id'):
            events.append({
                'timestamp': payment.timestamp,
                'reference': f'Balance payment #{payment.id}',
                'sale_amount': Decimal('0.00'),
                'paid_amount': Decimal(payment.amount)
            })
        return sorted(events, key=lambda event: (event['timestamp'], event['reference']))

    @staticmethod
    def _money(value):
        return f'KES {Decimal(value):,.2f}'



    def generate_customer_sales_statement(self, customer_object, start_date=None, end_date=None):
        """
        Generates a PDF statement showing how a customer picked fish over time.
        If start_date and end_date are provided, filters by range. Otherwise, fetches all.
        """
        styles = getSampleStyleSheet()
        
        header_title_style = ParagraphStyle(
            'HeaderTitle',
            parent=styles['Normal'],
            fontName='Helvetica-Bold',
            fontSize=16,
            textColor=colors.white,
            leading=18,
        )
        header_sub_style = ParagraphStyle(
            'HeaderSub',
            parent=styles['Normal'],
            fontName='Helvetica',
            fontSize=9,
            textColor=colors.white,
            leading=11,
        )
        meta_label_style = ParagraphStyle(
            'MetaLabel',
            parent=styles['Normal'],
            fontName='Helvetica-Bold',
            fontSize=10,
            textColor=colors.HexColor('#17324d'),
            leading=13,
        )
        meta_val_style = ParagraphStyle(
            'MetaValue',
            parent=styles['Normal'],
            fontName='Helvetica',
            fontSize=9,
            textColor=colors.HexColor('#64809a'),
            leading=12,
        )        
        # 1. Base queryset filtered by customer
        sales_query = Sale.objects.filter(customer=customer_object).order_by('timestamp', 'id')

        # 2. Conditionally apply date range filter if arguments are provided
        date_range_label = "All-Time History"
        if start_date and end_date:
            sales_query = sales_query.filter(timestamp__range=(start_date, end_date))
            date_range_label = f"Period: {start_date} to {end_date}"

        sales = list(sales_query)

        buffer = BytesIO()
        doc = SimpleDocTemplate(
            buffer,
            pagesize=A4,
            leftMargin=self.margin,
            rightMargin=self.margin,
            topMargin=self.margin,
            bottomMargin=self.margin
        )

        styles = getSampleStyleSheet()
        # ... setup styles (same as before) ...

        story = []

        # 1. Header Banner
        banner_data = [
            [Paragraph('<b>FRESH VICTORIA FISH</b>', header_title_style)],
            [Paragraph(f'Customer Sales Statement ({date_range_label})', header_sub_style)]
        ]
        usable_width = self.page_width - (2 * self.margin)
        banner_table = Table(banner_data, colWidths=[usable_width])
        banner_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#00509e')),
            ('TOPPADDING', (0, 0), (-1, -1), 10),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 10),
            ('LEFTPADDING', (0, 0), (-1, -1), 12),
            ('RIGHTPADDING', (0, 0), (-1, -1), 12),
        ]))
        story.append(banner_table)
        story.append(Spacer(1, 14))

        # 2. Customer Metadata
        phone_str = customer_object.phone or '-'
        email_str = customer_object.email or '-'
        meta_data = [
            [Paragraph(f'<b>Customer:</b> {customer_object.name}', meta_label_style)],
            [Paragraph(f'Phone: {phone_str} &nbsp;&nbsp;&nbsp;&nbsp; Email: {email_str}', meta_val_style)],
            [Paragraph(f'Current Debt Balance: <b>{self._money(customer_object.debt_balance)}</b>', meta_val_style)]
        ]
        meta_table = Table(meta_data, colWidths=[usable_width])
        meta_table.setStyle(TableStyle([
            ('TOPPADDING', (0, 0), (-1, -1), 2),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
            ('LEFTPADDING', (0, 0), (-1, -1), 0),
            ('RIGHTPADDING', (0, 0), (-1, -1), 0),
        ]))
        story.append(meta_table)
        story.append(Spacer(1, 14))

        # 3. Sales Ledger Table
        headers = ['Date', 'Sale Ref', 'Total Amount', 'Paid Now', 'Debt Added']
        table_data = [headers]

        total_sales_sum = Decimal('0.00')
        if not sales:
            table_data.append(['-', 'No sales recorded for this period', 'KES 0.00', 'KES 0.00', 'KES 0.00'])
        else:
            for sale in sales:
                total_sales_sum += Decimal(sale.total_amount)
                debt_incurred = Decimal(sale.total_amount) - Decimal(sale.amount_paid_now)
                table_data.append([
                    sale.timestamp.astimezone().strftime('%d %b %Y %H:%M'),
                    f'#{str(sale.id)[:8]}',
                    self._money(sale.total_amount),
                    self._money(sale.amount_paid_now),
                    self._money(debt_incurred)
                ])

        col_widths = [110, 120, 95, 95, 90.27]
        statement_table = Table(table_data, colWidths=col_widths, repeatRows=1)
        statement_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#edf8ff')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.HexColor('#00509e')),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 8),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
            ('TOPPADDING', (0, 0), (-1, -1), 6),
            ('ALIGN', (2, 0), (-1, -1), 'RIGHT'),
            ('LINEBELOW', (0, 0), (-1, -1), 0.5, colors.HexColor('#d8e8f2')),
        ]))
        story.append(statement_table)

        doc.build(story)
        buffer.seek(0)
        return buffer

    

    