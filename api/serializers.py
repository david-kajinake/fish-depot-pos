from rest_framework import serializers
from django.db import transaction
from django.utils import timezone
from decimal import Decimal
from .models import ( User, Customer, Supplier,
                      FishSize, Day, Sale, SaleItem, 
                      SupplyInvoice, FishStock, 
                      OutsideFrying, BalancePayment, 
                      Expense, SystemSetting, UserSetting 
                    )

class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = [ "id" , "username" , "name" , 
                  "role" , "phone" , "email", 
                  "is_staff", "is_superuser", 'can_call_it_a_day', 
                  'can_record_sale', 'can_record_stock_supply',
                  'can_record_expenses', 'can_record_customer_balance_debt_payment',
                  'can_send_messages_to_customers', 'can_edit_customers_info',
                  'can_edit_suppliers_info', 'can_generate_statements' ]

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
    
    @transaction.atomic
    def create(self , validated_data ):
        #Get the request
        request = self.context.get("request") 
        #We extract the items list before creating the sale object
        items_data = validated_data.pop('items')

        # Never trust sale totals or stock availability supplied by the browser.
        # Aggregate first because a cashier can add the same fish size to more
        # than one cart line.
        requested_stock = {}
        calculated_total = Decimal('0.00')
        for item in items_data:
            fish_size_id = item['fish_size'].pk
            requested = requested_stock.setdefault(fish_size_id, {'weight': Decimal('0.00'), 'quantity': 0})
            requested['weight'] += item['weight']
            requested['quantity'] += item['quantity']
            calculated_total += (item['weight'] * item['rate_charged']) + item.get('frying_fee_applied', Decimal('0.00'))

        fish_sizes = {
            fish_size.pk: fish_size
            for fish_size in FishSize.objects.select_for_update().filter(pk__in=requested_stock)
        }
        for fish_size_id, requested in requested_stock.items():
            fish_size = fish_sizes.get(fish_size_id)
            if fish_size is None:
                raise serializers.ValidationError({'items': f'Fish size {fish_size_id} no longer exists.'})
            if requested['weight'] > fish_size.current_stock_kg:
                raise serializers.ValidationError({'items': f'Only {fish_size.current_stock_kg} kg of size {fish_size.name} is in stock.'})
            if requested['quantity'] > fish_size.current_stock_qty:
                raise serializers.ValidationError({'items': f'Only {fish_size.current_stock_qty} pieces of size {fish_size.name} are in stock.'})

        # The total is the weight charge plus every frying fee, calculated on
        # the server so a tampered client cannot omit a frying amount.
        validated_data['total_amount'] = calculated_total
        customer_name = validated_data.pop('customer_name', '').strip()
        if customer_name and not validated_data.get('customer'):
            # A cashier can type a new customer's name directly into the sale
            # form.  Reuse an existing name regardless of casing so that
            # "Amina" and "amina" do not become two customer records.
            customer = Customer.objects.filter(name__iexact=customer_name).first()
            if customer is None:
                customer = Customer.objects.create(name=customer_name)
            validated_data['customer'] = customer
        total_amount = calculated_total
        amount_paid = validated_data['amount_paid_now']
        customer = validated_data.get('customer')
        if amount_paid != total_amount and not customer:
            raise serializers.ValidationError({'customer_name': 'A customer is required when payment differs from the sale total.'})
        if customer and amount_paid > total_amount + Decimal(customer.debt_balance):
            raise serializers.ValidationError({'amount_paid_now': 'Amount cannot exceed the sale total plus the customer’s outstanding balance.'})
        validated_data['sale_type'] = 'INSTANT' if amount_paid >= total_amount else 'LATE'

        # Create the day only after every validation above succeeds.
        today_date = timezone.localdate()
        day_object, created = Day.objects.get_or_create(date=today_date)
        sale = Sale.objects.create( cashier = request.user , day = day_object ,  **validated_data)
        
        for item in items_data:
            SaleItem.objects.create(
                sale = sale , 
                **item ,
            )
        if sale.customer and amount_paid != total_amount:
            # Positive difference adds debt; a payment above the sale amount
            # first settles the sale and then lowers existing debt.
            sale.customer.debt_balance = Decimal(sale.customer.debt_balance) + (total_amount - amount_paid)
            sale.customer.save(update_fields=['debt_balance'])
        return sale


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



