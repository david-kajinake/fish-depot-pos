from rest_framework import serializers
from django.db import transaction
from django.utils import timezone
from .models import ( User, Customer, Supplier,
                      FishSize, Day, Sale, SaleItem, 
                      SupplyInvoice, FishStock, 
                      OutsideFrying, BalancePayment, 
                      Expense, SystemSetting, UserSetting 
                    )

class UserSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=False, allow_blank=False, min_length=8)

    class Meta:
        model = User
        fields = [ "id" , "username" , "name" , 
                  "role" , "phone" , "email", 
                  "is_staff", "is_superuser", 'can_call_it_a_day', 
                  'can_record_sale', 'can_record_stock_supply',
                  'can_record_expenses', 'can_record_customer_balance_debt_payment',
                  'can_send_messages_to_customers', 'can_edit_customers_info',
                  'can_edit_suppliers_info', 'can_generate_statements',
                  'is_disabled', 'password' ]
        read_only_fields = ['id', 'is_staff', 'is_superuser']

    def validate_role(self, value):
        request = self.context.get('request')
        if request and not request.user.is_superuser and request.user.role == User.MANAGER and value != User.CASHIER:
            raise serializers.ValidationError('Managers can only create or assign cashier accounts.')
        return value

    def create(self, validated_data):
        password = validated_data.pop('password', None)
        user = User(**validated_data)
        if password:
            user.set_password(password)
        else:
            user.set_unusable_password()
        user.save()
        return user

    def update(self, instance, validated_data):
        password = validated_data.pop('password', None)
        for field, value in validated_data.items():
            setattr(instance, field, value)
        if password:
            instance.set_password(password)
        instance.save()
        return instance

class CustomerSerializer( serializers.ModelSerializer ):
    active_60_days = serializers.BooleanField(read_only=True)
    total_spent = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    total_weight_sold = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    class Meta:
        model = Customer
        fields = ["id", "name", "phone", "email", "debt_balance", "is_active", "created_at", "active_60_days", "total_spent", "total_weight_sold"]


class BalancePaymentSerializer(serializers.ModelSerializer):
    class Meta:
        model = BalancePayment
        fields = ["id", "customer", "amount", "timestamp"]

        
class FishSizeSerializer( serializers.ModelSerializer ):
    class Meta:
        model = FishSize
        fields = "__all__"




class SaleItemsSerializer( serializers.ModelSerializer ):
    #Include the fish_size name for the UI, but keep the ID for the database
    fish_size_name = serializers.ReadOnlyField( source = 'fish_size.name' )
    class Meta:
        model = SaleItem
        fields = [ 'id', 'fish_size', 'fish_size_name', 'weight', 'quantity', 'rate_charged', 'is_fried', 'frying_fee_applied', ]
            



class SaleSerializer(serializers.ModelSerializer):
    items = SaleItemsSerializer( many = True )
    customer_name = serializers.CharField(required=False, allow_blank=True, write_only=True)
    customer_display_name = serializers.ReadOnlyField(source='customer.name')
    cashier = serializers.PrimaryKeyRelatedField( read_only = True )
    day = serializers.PrimaryKeyRelatedField( read_only = True )
    
    class Meta:
        model = Sale
        fields = [ 'id', 'day' , 'cashier' , 'customer' , 'customer_name', 'customer_display_name', 'sale_type' , 'total_amount' , 'amount_paid_now' , 'timestamp' , 'items'  ]


class FishStockSerializer(serializers.ModelSerializer):
    fish_size_name = serializers.ReadOnlyField( source = 'fish_size.name'  )
    #Map the incoming frontend names ( weight , rate ) to the frontend names
    weight = serializers.DecimalField( source = 'weight_received' , max_digits= 10 , decimal_places= 2 )
    rate = serializers.DecimalField( source = 'unit_buying_price' , max_digits= 10 , decimal_places= 2 )

    class Meta:
        model = FishStock 
        #total_cost is read-only because our models.py automatically calculates it  
        #Notice we use the mapped names here so DRF understands the fronend payload 
        fields = ['id','fish_size','fish_size_name',
                  'quantity', 'weight', 
                  'rate', 'total_cost'  
                 ]
        read_only_fields = ['total_cost']


class SupplyInvoiceSerializer( serializers.ModelSerializer ):

        #stock_items must match the related_name we set in models.py
        stock_items = FishStockSerializer( many= True )
        supplier_name = serializers.ReadOnlyField( source= 'supplier.name' )
        class Meta:
            model = SupplyInvoice
            fields= ['id', 'day' , 'supplier' ,'supplier_name' , 
                     'total_invoice_cost', 'amount_paid_to_supplier', 
                     'timestamp', 'stock_items' , 'total_weight'
                     ]
            #Make the total_invoice_cost read only
            read_only_fields = ['total_invoice_cost' , 'total_weight','day']


        @transaction.atomic # The Magic Shield: Either save All or Save nothing. can't save partial
        def create(self, validated_data):
            #Extract the list of fish from the request
            stock_items_data = validated_data.pop( 'stock_items' )

            #Handle the Day logic. frontend doesn't
            today = timezone.now().date()
            current_day , created = Day.objects.get_or_create(
                date = today , 
                defaults= {'is_closed': False}
            )



            #Create the master invoice , inject the current day
            invoice = SupplyInvoice.objects.create( day = current_day ,  **validated_data)

            #Loop through and create each FishStock
            for  item_data in stock_items_data:
                """
                When we call create() here, it triggers the FishStock.save() method.
                the custom save() method will automatically update the FishSize current_stock , 
                and the SupplyInvoice total_invoice_cost.
                """
                FishStock.objects.create(
                    invoice = invoice , 
                    **item_data
                )
            return invoice


class SupplierSerializer( serializers.ModelSerializer ):
    total_weight = serializers.DecimalField( max_digits= 10 , decimal_places= 2 , read_only= True )
    total_amount = serializers.DecimalField(max_digits=15, decimal_places=2, read_only=True)
    past_supplies = SupplyInvoiceSerializer( source = "invoices" , many = True , read_only = True )
    class Meta:
        model = Supplier
        fields = [ "id", "name" , "phone" , "email" , "last_supply_date" , "total_weight" , "total_amount","past_supplies" ]
        #you can also use fields = "__all__"



#Serializer of a single frying item row
class OutsideFryingItemSerializer( serializers.ModelSerializer ):
    class Meta:
        model = OutsideFrying
        fields = [ "id", "source", "quantity", "total_fee" ]


class DaySerializer(serializers.ModelSerializer):
    sales = SaleSerializer(many=True)
    outside_fryings = OutsideFryingItemSerializer(source='outsidefrying_set', many=True, read_only=True)

    class Meta:
        model = Day
        fields = ["date", "opening_balance", "closing_balance", "is_closed", "sales", "outside_fryings"]
    

#Serializer of multiple frying item rows
class OutsideFryingBulkSerializer( serializers.Serializer ):
        items = OutsideFryingItemSerializer( many = True )

        def create(self, validated_data):
            frying_items = validated_data.pop("items")

            #get or create today's day record
            today, created = Day.objects.get_or_create(date=timezone.localdate())

            #Loop through the array and create individual database row for each item
            created_records = []
            for item_data in frying_items:
                record = OutsideFrying.objects.create(  day = today , **item_data  )
                created_records.append( record )
            
            return {"items": created_records}

class ExpenseSerializer(serializers.ModelSerializer):
    class Meta:
        model= Expense
        fields = "__all__"
        read_only_fields = ['day']



class SystemSettingSerializer(serializers.ModelSerializer):
    class Meta:
        model = SystemSetting
        fields = '__all__'

class UserSettingSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserSetting
        fields = '__all__'
        read_only_fields = ['user']



