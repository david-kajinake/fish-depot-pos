from django.shortcuts import render
from rest_framework.views import APIView
from rest_framework import permissions, viewsets , status
from rest_framework.response import Response
from rest_framework.decorators import action #For custom routes
from rest_framework_simplejwt.views import TokenObtainPairView
from rest_framework_simplejwt.tokens import RefreshToken
from django.db.models.functions import Coalesce
from datetime import date
from .models import ( User, Customer, Supplier, FishSize, 
                     Day, Sale, SaleItem, 
                     SupplyInvoice , OutsideFrying, 
                     Expense, BalancePayment,
                     SystemSetting, UserSetting
                     )
from .serializers import(
    UserSerializer , CustomerSerializer , SupplierSerializer ,
    FishSizeSerializer , SaleSerializer , 
    SupplyInvoiceSerializer ,DaySerializer , 
    OutsideFryingItemSerializer ,  OutsideFryingBulkSerializer, 
    ExpenseSerializer, SystemSettingSerializer, UserSettingSerializer
)
from . import permissions as Custom_permissions #Custom permissions
from . import tasks
from celery.result import AsyncResult
from django.db.models import Sum, Value, DecimalField, OuterRef, Exists, Subquery
from django.utils import timezone
from datetime import timedelta
from decimal import Decimal
from django.core.mail import EmailMessage
from .utils.generate_statement import StatementGenerator
from .models import BalancePayment
from .serializers import BalancePaymentSerializer


def queue_statement(task, request, **kwargs):
    """Validate a common statement request and return its Celery task response."""
    email = str(request.data.get('email', '')).strip()
    if not email:
        return None, Response({'email': 'Enter a destination email address.'}, status=status.HTTP_400_BAD_REQUEST)
    start_date = request.data.get('start_date') or None
    end_date = request.data.get('end_date') or None
    if bool(start_date) != bool(end_date):
        return None, Response({'date_range': 'Provide both start_date and end_date, or neither.'}, status=status.HTTP_400_BAD_REQUEST)
    task_result = task.delay(recipient_email=email, start_date=start_date, end_date=end_date, **kwargs)
    return task_result, None

# Create your views here.

class TaskStatusView(APIView):
    """Poll celery task status using task_id"""
    permission_classes= [permissions.IsAuthenticated,]

    def get(self, request, task_id):
        result= AsyncResult(task_id)

        if result.status == 'PENDING':
            response= {"state": result.state, "status": "Queued..."}
        elif result.status == 'STARTED':
            response= {"state": result.state, "status": "Generating PDF and sending email..."}
        elif result.status == 'SUCCESS':
            response= {"state": result.state, "result": result.result}
        elif result.status == 'FAILURE':
            response= {"state": result.state, "error": str(result.info)}
        else:
            response= {"state": result.state, "status": str(result.info)}

        return Response( response, status= status.HTTP_200_OK )



class UnifiedLoginView(TokenObtainPairView):
    """
    Validates credentials, returns SimpleJWT tokens for the Desktop POS & Mobile app,
    for every client (web, mobile, and desktop).
    """
    permission_classes = [permissions.AllowAny]
    def post(self, request, *args, **kwargs):
        #Validate credentials
        serializer= self.get_serializer(data= request.data)
        serializer.is_valid(raise_exception = True)
        user = serializer.user
        user.apply_login_timestamp()
        user.save(update_fields=['last_login'])
        return Response({
            **serializer.validated_data,
            'user': UserSerializer(user).data,
        })


class JwtLogoutView(APIView):
    """Blacklist the supplied refresh token; access tokens stay short-lived."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        refresh = request.data.get('refresh')
        if not refresh:
            return Response({'refresh': 'A refresh token is required.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            RefreshToken(refresh).blacklist()
        except Exception:
            return Response({'refresh': 'Invalid or expired refresh token.'}, status=status.HTTP_400_BAD_REQUEST)
        return Response(status=status.HTTP_204_NO_CONTENT)


class CurrentUserView(APIView):
    """The token-authenticated identity for decoupled web and device clients."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        return Response(UserSerializer(request.user).data)

class UsersViewset(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = UserSerializer
    queryset= User.objects.all()

class CustomerViewSet( viewsets.ModelViewSet ): 
    """
    Automatically handles:
    GET /api/customers/ -> all customers
    POST /api/customers/ -> Create new
    GET /api/customers/<id> -> One customer
    PATCH /api/customers/<id> -> Update
    """
    serializer_class = CustomerSerializer

    def get_queryset(self):
        recent_sale = Sale.objects.filter(customer=OuterRef('pk'), timestamp__gte=timezone.now() - timedelta(days=60))
        customer_sales = Sale.objects.filter(customer=OuterRef('pk')).values('customer')
        customer_weight = SaleItem.objects.filter(sale__customer=OuterRef('pk')).values('sale__customer')
        return Customer.objects.annotate(
            active_60_days=Exists(recent_sale),
            total_spent=Coalesce(Subquery(customer_sales.annotate(total=Sum('total_amount')).values('total')[:1]), Value(0), output_field=DecimalField(max_digits=14, decimal_places=2)),
            total_weight_sold=Coalesce(Subquery(customer_weight.annotate(total=Sum('weight')).values('total')[:1]), Value(0), output_field=DecimalField(max_digits=14, decimal_places=2)),
        ).order_by('-created_at')

    @action(detail=True, methods=['get'], url_path='history')
    def history(self, request, pk=None):
        sales = Sale.objects.filter(customer=self.get_object()).order_by('-timestamp')
        return Response(SaleSerializer(sales, many=True).data)

    @action(detail=True, methods=['post'], url_path='record-balance-payment', permission_classes= [Custom_permissions.CanRecordCustomerBalanceDebt,])
    def record_balance_payment(self, request, pk=None):
        customer = self.get_object()
        try:
            amount = Decimal(str(request.data.get('amount', '0')))
        except Exception:
            return Response({'amount': 'Enter a valid amount.'}, status=status.HTTP_400_BAD_REQUEST)
        if amount <= 0:
            return Response({'amount': 'Amount must be greater than zero.'}, status=status.HTTP_400_BAD_REQUEST)
        if amount > customer.debt_balance:
            return Response({'amount': 'Amount cannot exceed the current debt balance.'}, status=status.HTTP_400_BAD_REQUEST)
        payment = BalancePayment.objects.create(customer=customer, amount=amount)
        customer.debt_balance -= amount
        customer.save(update_fields=['debt_balance'])
        return Response({'payment': BalancePaymentSerializer(payment).data, 'debt_balance': customer.debt_balance})

    @action(detail=True, methods=['post'], url_path='send-statement', permission_classes = [Custom_permissions.CanGenerateStatements])
    def send_statement(self, request, pk=None):
        """Email a concise customer statement after confirming the operator."""
        customer = self.get_object()
        email = str(request.data.get('email', '')).strip()
        password = request.data.get('password', '')
        if not email:
            return Response({'email': 'Enter a destination email address.'}, status=status.HTTP_400_BAD_REQUEST)
        if not password or not request.user.check_password(password):
            return Response({'password': 'Your current password is incorrect.'}, status=status.HTTP_400_BAD_REQUEST)

        sales = Sale.objects.filter(customer=customer).order_by('-timestamp')
        lines = [
            f'Balance Payment Satement For Customer: {customer.name}',
            f'Outstanding balance: KES {customer.debt_balance:.2f}',
            '',
            'Payment History:'
        ]
        lines.extend(
            f'{sale.timestamp:%Y-%m-%d %H:%M}  #{sale.id}  KES {sale.total_amount:.2f}'
            for sale in sales
        )
        if not sales.exists():
            lines.append('No sales have been recorded.')
        message = EmailMessage(
            subject=f'Fresh Victoria Fish — {customer.name}',
            body='\n'.join(lines),
            to=[email],
        )
        statement_pdf = StatementGenerator().generate_balance_history(customer)
        message.attach(f'{customer.name}--balance-statement.pdf', statement_pdf.read(), 'application/pdf')
        message.send(fail_silently=False)
        return Response({'detail': 'Statement sent.', 'email': email})


    @action(detail= True,methods= ['post'], url_path= 'send-sales-statement', permission_classes= [Custom_permissions.CanGenerateStatements,] )
    def send_sales_statement(self, request, pk= None):
        customer = self.get_object()
        email = str(request.data.get('email', '')).strip()
        password = request.data.get('password', '')
        if not email:
            return Response({'email': 'Enter a destination email address.'}, status=status.HTTP_400_BAD_REQUEST)
        if not password or not request.user.check_password(password):
            return Response({'password': 'Your current password is incorrect.'}, status=status.HTTP_400_BAD_REQUEST)

        task= tasks.generate_and_email_customer_statement.delay(
            customer_id= customer.id, 
            recipient_email= email
            )
        return Response(
            {
                "detail": "Customer's Sales statement successfully sent",
                "task_id": task.id,
             }, status= status.HTTP_202_ACCEPTED
            )

        



    @action( detail= False , methods= ["get"] , url_path= "top-analytics" )
    def top_analytics( self , request ):
        """
        Endpoint: /api/customers/top-analytics/
        """
        customers = Customer.objects.annotate(
            total_purchases = Sum("sale__total_amount")
        ).filter(
            total_purchases__gt= 0 #only retrieve those whose sales is greater than 0
        ).order_by(
            "-total_purchases"
        )[:10] #Get the top 10

        data = {
            "labels":[ customer.name for customer in customers ] , 
            "datasets":[ customer.total_purchases for customer in customers ]
        }
        return Response( data , status= status.HTTP_200_OK )


class SupplierViewsSet(viewsets.ModelViewSet):
    serializer_class = SupplierSerializer

    def get_queryset(self):
        return Supplier.objects.annotate(
            total_weight = Coalesce(
            Sum("invoices__stock_items__weight_received",output_field=DecimalField(max_digits=12,decimal_places=2)) ,
                Value(0) ,
                output_field= DecimalField( decimal_places= 2 , max_digits= 12 ) 
            ) ,

            total_amount = Coalesce(
                Sum("invoices__total_invoice_cost",output_field=DecimalField(decimal_places=2,max_digits=15)), 
                Value( 0 ) , 
                output_field= DecimalField( decimal_places= 2 , max_digits= 15 ) 
            ) , 
            
        ).order_by("-name")

    
    @action( detail = True , methods = ["get"] ,   url_path = "history" )
    def get_history( self , request, pk= None  ):
        supplier = self.get_object()
        invoices = supplier.invoices.all()
        serializer = SupplyInvoiceSerializer( invoices , many = True )
        return Response( serializer.data , status = 200 )
    
    @action( detail=False , methods= ["get"] , url_path= "top-analytics" )
    def top_analytics( self , request ):
        """
        Endpoint: /api/suppliers/top-analytics/
        """     
        suppliers = Supplier.objects.annotate(
            total_supplied = Sum( "invoices__total_invoice_cost" )
        ).filter(
            total_supplied__gt= 0  #only retrieve those whose supplies is greater than 0
        ).order_by(
            "-total_supplied"
        )[:10]   #Get the top 10
        data = {
            "labels":[ supplier.name for supplier in suppliers ] , 
            "datasets":[ float(supplier.total_supplied) for supplier in suppliers ]
        }
        return Response( data , status= status.HTTP_200_OK ) 

    @action( detail= True, methods=['post'], url_path= 'send-single-supplier-statement', permission_classes= [Custom_permissions.CanGenerateStatements] )
    def send_single_supplier_statement(self, request, pk= None):
        """Sends a single particular supplier's statement"""
        task_result, error = queue_statement(tasks.generate_and_email_supplier_statement, request, supplier_id=self.get_object().id)
        if error:
            return error
        return Response({'detail': 'Supplier statement queued.', 'task_id': task_result.id}, status=status.HTTP_202_ACCEPTED)


    @action( detail= False, methods= ['post'], url_path= 'send-all-suppliers-statement', permission_classes= [Custom_permissions.CanGenerateStatements] )
    def send_all_suppliers_statement(self, request, pk= None):
        """sends a statement for all stock supplies"""
        task_result, error = queue_statement(tasks.generate_and_email_all_suppliers_statement, request)
        if error:
            return error
        return Response({'detail': 'All suppliers statement queued.', 'task_id': task_result.id}, status=status.HTTP_202_ACCEPTED)




class FishViewSet( viewsets.ModelViewSet ):
    queryset = FishSize.objects.all()
    serializer_class = FishSizeSerializer


class SaleViewSet(viewsets.ModelViewSet):
   """
    Because we overrode the create() method in SaleSerializer,
    when a Desktop app sends a POST request here with the Cart JSON,
    this ViewSet automatically processes the master Sale and the nested SaleItems!
   """
   permission_classes = [permissions.AllowAny]
   queryset =Sale.objects.all().order_by("-timestamp")
   serializer_class = SaleSerializer

   @action(detail= False, methods= ['get'], url_path= 'today')
   def get_today_sales(self, request, pk= None):
       """Endpoint: api/sales/today/"""

       today, created = Day.objects.get_or_create( date= timezone.localdate() )
       today_sales = Sale.objects.filter( day= today )
       serializer= self.get_serializer(today_sales, many= True)
       return Response( serializer.data , status= status.HTTP_200_OK)

   @action(detail=False, methods=['post'], url_path='send-sales-statement', permission_classes=[Custom_permissions.CanGenerateStatements])
   def send_sales_statement(self, request, pk=None):
       task_result, error = queue_statement(tasks.generate_and_email_sales_statement, request)
       if error:
           return error
       return Response({'detail': 'Sales statement queued.', 'task_id': task_result.id}, status=status.HTTP_202_ACCEPTED)

   


class SupplyInvoiceViewSet( viewsets.ModelViewSet ):
    queryset = SupplyInvoice.objects.all().order_by("-timestamp")
    serializer_class = SupplyInvoiceSerializer


class DayViewSet( viewsets.ModelViewSet ):
    queryset = Day.objects.all().order_by("-date")
    serializer_class = DaySerializer

    @action(detail=False, methods=['POST'], url_path="close-day", permission_classes=[Custom_permissions.CanCallItADay,])
    def close_day(self, request):
        """
        Custom Endpoint: POST /api/days/close-day
        """
        current_day = Day.objects.filter(date=timezone.localdate()).first()
        if not current_day:
            return Response({"Error": "No day is open yet"}, status=status.HTTP_400_BAD_REQUEST)
        if current_day.is_closed:
            return Response({"Error":"This day is already closed"}, status= status.HTTP_400_BAD_REQUEST )
        
        total_sales = sum( sale.total_amount for sale in current_day.sales.all()  )
        total_supplies = sum( invoice.total_invoice_cost for invoice in current_day.supply_invoices.all())

        #Update the closing Balance ( opening + sale - supplies )
        current_day.closing_balance = current_day.opening_balance + total_sales - total_supplies
        current_day.is_closed = True
        current_day.save()

        # NOTE: Here is where Africa's Talking SMS logic will be added later!
        # send_sms(f"Day Closed. Total Sales: {total_sales}. Net Balance: {current_day.closing_balance}")

        return Response(
            { 
                "message": f"Day {current_day.date} Successfully closed",
                "total_sales": total_sales , 
                "closing_balance": current_day.closing_balance ,
            } ,
            status= status.HTTP_200_OK ,
        )
    

class OutsideFryingViewSet( viewsets.ModelViewSet ):
    queryset = OutsideFrying.objects.all()

    def get_serializer_class(self):
        
        #Use the Bulk Wrapper only when submitting new fryings data ( POST )
        if self.action == "create":
            return OutsideFryingBulkSerializer
        return OutsideFryingItemSerializer

    
    
class ExpenseViewSet(viewsets.ModelViewSet):
    queryset = Expense.objects.all().order_by("-day")
    serializer_class= ExpenseSerializer
    permission_classes= [permissions.IsAuthenticated]

    def perform_create(self, serializer):
        """Automatically assign today's Day instance when creating an expense."""
        today, created = Day.objects.get_or_create(date = timezone.localdate())
        serializer.save(day = today)


    @action(detail= False, methods=['get'], url_path= 'today')
    def get_today_expenses(self, request, pk= None):
        today, created = Day.objects.get_or_create( date= timezone.localdate() )
        today_expenses = Expense.objects.filter( day= today )
        serializer= ExpenseSerializer( today_expenses, many= True )
        return Response( serializer.data, status= status.HTTP_200_OK )


    @action(detail=True, methods=['post'], url_path='send-single-expenses-statement', permission_classes=[Custom_permissions.CanGenerateStatements])
    def send_single_expenses_statement(self, request, pk=None):
        expense = self.get_object()
        task_result, error = queue_statement(tasks.generate_and_email_single_expense_statement, request, expense_name=expense.item_name)
        if error:
            return error
        return Response({'detail': 'Expense statement queued.', 'task_id': task_result.id}, status=status.HTTP_202_ACCEPTED)

    @action(detail=False, methods=['post'], url_path='send-all-expenses-statement', permission_classes=[Custom_permissions.CanGenerateStatements])
    def send_all_expenses_statement(self, request, pk=None):
        task_result, error = queue_statement(tasks.generate_and_email_all_expenses_statement, request)
        if error:
            return error
        return Response({'detail': 'All expenses statement queued.', 'task_id': task_result.id}, status=status.HTTP_202_ACCEPTED)


class SystemSettingView(APIView):
    """GET/PUT for the global system settings. Admin only."""
    permission_classes = [permissions.IsAdminUser]

    def get(self, request):
        setting = SystemSetting.load()
        serializer = SystemSettingSerializer(setting)
        return Response(serializer.data)

    def put(self, request):
        setting = SystemSetting.load()
        serializer = SystemSettingSerializer(setting, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

class UserSettingView(APIView):
    """GET/PUT for the logged-in user's personal display settings."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        setting, created = UserSetting.objects.get_or_create(user=request.user)
        serializer = UserSettingSerializer(setting)
        return Response(serializer.data)

    def put(self, request):
        setting, created = UserSetting.objects.get_or_create(user=request.user)
        serializer = UserSettingSerializer(setting, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class UserProfileUpdateView(APIView):
    """Dedicated endpoint to update username and password."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        return Response(UserSerializer(request.user).data)

    def put(self, request):
        user = request.user
        username = request.data.get('username')
        password = request.data.get('password')
        
        if username:
            user.username = username
        if password:
            user.set_password(password)
            
        user.save()
        return Response({"message": "Profile updated successfully."})

