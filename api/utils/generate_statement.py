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

from api.models import BalancePayment, Expense, Sale, SupplyInvoice


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


    def generate_sales_statement(self, start_date= None, end_date= None ):
        """This statement applies to all sales that were made during the specified
           time range. absolutely all of them are returned if no range was specified.
           it does not apply to a single or specific group of customers
        """
        sales = self._filter_timestamp(Sale.objects.all().order_by('timestamp'), start_date, end_date)
        rows = [[sale.timestamp, f'#{sale.id[:8]}', sale.customer.name if sale.customer else 'Walk-in', sale.total_amount, sale.amount_paid_now] for sale in sales]
        return self._generate_tabular_statement(
            'Sales statement', self._range_label(start_date, end_date),
            ['Date', 'Reference', 'Customer', 'Sale amount', 'Paid now'], rows,
            ['Sales total', self._money(sum((Decimal(sale.total_amount) for sale in sales), Decimal('0.00')))],
        )



    def generate_supplier_stock_supply_statement(self, supplier_object, start_date= None, end_date= None):
        """
        This statement applies to a single specific supplier. 
        it returns all stock supplies associated with a supplier in a specified time range.
        absolutely all supplies are returned if no time range has been defined
        """
        invoices = self._filter_timestamp(supplier_object.invoices.all().order_by('timestamp'), start_date, end_date)
        rows = [[invoice.timestamp, f'#{invoice.id[:8]}', invoice.total_weight, invoice.total_invoice_cost, invoice.amount_paid_to_supplier] for invoice in invoices]
        return self._generate_tabular_statement(
            f'Supplier stock supply statement - {supplier_object.name}', self._range_label(start_date, end_date),
            ['Date', 'Invoice', 'Weight (kg)', 'Invoice cost', 'Paid'], rows,
            ['Supply cost total', self._money(sum((Decimal(invoice.total_invoice_cost) for invoice in invoices), Decimal('0.00')))],
        )



    def generate_stock_supply_statement(self, start_date= None, end_date= None):
        """
        This statement applies to all fish stocks that were supplied in a specified time range.
        absolutely all supplies are returned if no time range was defined.
        it does not apply to a single or specific group of suppliers. it applies to all stock supplies
        """
        invoices = self._filter_timestamp(SupplyInvoice.objects.select_related('supplier').all().order_by('timestamp'), start_date, end_date)
        rows = [[invoice.timestamp, f'#{invoice.id[:8]}', invoice.supplier.name if invoice.supplier else 'Unknown', invoice.total_weight, invoice.total_invoice_cost] for invoice in invoices]
        return self._generate_tabular_statement(
            'All stock supplies statement', self._range_label(start_date, end_date),
            ['Date', 'Invoice', 'Supplier', 'Weight (kg)', 'Invoice cost'], rows,
            ['Supply cost total', self._money(sum((Decimal(invoice.total_invoice_cost) for invoice in invoices), Decimal('0.00')))],
        )


    def generate_single_expenses_statement(self, expense_name, start_date= None, end_date= None):
        """
        This statement applies to a single particular expense ( soap, water, electricity, gas,....  ) and shows how much it was spent on in a specified time range.
        if no time range is specified then it should return all-time history for the given expense name
        """
        expenses = Expense.objects.filter(item_name__iexact=expense_name).select_related('day').order_by('day__date')
        expenses = self._filter_day(expenses, start_date, end_date)
        rows = [[expense.day.date, expense.item_name, expense.amount] for expense in expenses]
        return self._generate_tabular_statement(
            f'Expense statement - {expense_name}', self._range_label(start_date, end_date),
            ['Date', 'Expense', 'Amount'], rows,
            ['Expense total', self._money(sum((Decimal(expense.amount) for expense in expenses), Decimal('0.00')))],
        )


    def generate_all_expenses_statement(self, start_date= None, end_date= None):
        """
        This statement applies to all expenses with how much they were spent on in aspecified time range.
        if no time range is given then it should return all expenses regardless.
        it does not apply to a single or specific group of expenses.
        """
        expenses = self._filter_day(Expense.objects.select_related('day').all().order_by('day__date'), start_date, end_date)
        rows = [[expense.day.date, expense.item_name, expense.amount] for expense in expenses]
        return self._generate_tabular_statement(
            'All expenses statement', self._range_label(start_date, end_date),
            ['Date', 'Expense', 'Amount'], rows,
            ['Expense total', self._money(sum((Decimal(expense.amount) for expense in expenses), Decimal('0.00')))],
        )

    def _generate_tabular_statement(self, title, subtitle, headers, rows, total):
        """Create a consistent PDF for operational (non-customer) statements."""
        buffer = BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=A4, leftMargin=self.margin, rightMargin=self.margin, topMargin=self.margin, bottomMargin=self.margin)
        styles = getSampleStyleSheet()
        title_style = ParagraphStyle('statement-title', parent=styles['Title'], textColor=colors.white, fontSize=16, leading=18)
        sub_style = ParagraphStyle('statement-subtitle', parent=styles['Normal'], textColor=colors.white, fontSize=9)
        banner = Table([[Paragraph('FRESH VICTORIA FISH', title_style)], [Paragraph(f'{title}<br/>{subtitle}', sub_style)]], colWidths=[self.page_width - 2 * self.margin])
        banner.setStyle(TableStyle([('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#00509e')), ('LEFTPADDING', (0, 0), (-1, -1), 12), ('TOPPADDING', (0, 0), (-1, -1), 9), ('BOTTOMPADDING', (0, 0), (-1, -1), 9)]))
        data = [headers]
        for row in rows:
            data.append([self._display_date(value) if index == 0 else self._money(value) if isinstance(value, Decimal) and index >= len(row) - 2 else str(value) for index, value in enumerate(row)])
        if not rows:
            data.append(['No entries found for this period'] + [''] * (len(headers) - 1))
        table = Table(data, repeatRows=1, colWidths=[(self.page_width - 2 * self.margin) / len(headers)] * len(headers))
        table.setStyle(TableStyle([('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#edf8ff')), ('TEXTCOLOR', (0, 0), (-1, 0), colors.HexColor('#00509e')), ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'), ('FONTSIZE', (0, 0), (-1, -1), 8), ('GRID', (0, 0), (-1, -1), .35, colors.HexColor('#d8e8f2')), ('TOPPADDING', (0, 0), (-1, -1), 6), ('BOTTOMPADDING', (0, 0), (-1, -1), 6)]))
        doc.build([banner, Spacer(1, 14), table, Spacer(1, 10), Paragraph(f'<b>{total[0]}:</b> {total[1]}', styles['BodyText'])])
        buffer.seek(0)
        return buffer

    @staticmethod
    def _display_date(value):
        return value.astimezone().strftime('%d %b %Y %H:%M') if hasattr(value, 'astimezone') else value.strftime('%d %b %Y')

    @staticmethod
    def _range_label(start_date, end_date):
        return f'Period: {start_date} to {end_date}' if start_date and end_date else 'All-time history'

    @staticmethod
    def _filter_timestamp(queryset, start_date, end_date):
        if start_date:
            queryset = queryset.filter(timestamp__date__gte=start_date)
        if end_date:
            queryset = queryset.filter(timestamp__date__lte=end_date)
        return queryset

    @staticmethod
    def _filter_day(queryset, start_date, end_date):
        if start_date:
            queryset = queryset.filter(day__date__gte=start_date)
        if end_date:
            queryset = queryset.filter(day__date__lte=end_date)
        return queryset
