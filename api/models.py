from django.db import models 
from django.conf import settings
from decimal import Decimal
from django.contrib.auth.models import AbstractUser
from .utils import generate_ulid , get_current_time
from django.utils import timezone

# Create your models here.

#Users and people

class User(AbstractUser):
    # Roles defined as constants
    ADMIN = 'ADMIN'
    CASHIER = 'CASHIER'
    MANAGER = 'MANAGER'
    ROLE_CHOICES = [
        (ADMIN, 'Admin'),
        (CASHIER, 'Cashier'),
        (MANAGER, 'Manager') ,

    ]
    name = models.CharField( max_length= 255 )
    id = models.CharField( primary_key= True , default= generate_ulid , editable= False , max_length= 255 )
    role = models.CharField(max_length=10, choices=ROLE_CHOICES, default=CASHIER)
    phone = models.CharField(max_length=15, blank=True, null=True)
    email = models.EmailField( max_length = 255 , blank= True  )
    last_login = models.DateTimeField(  default= get_current_time )
    # Granular POS Permissions
    can_call_it_a_day = models.BooleanField(default=False)
    can_record_sale = models.BooleanField(default=True)
    can_record_stock_supply = models.BooleanField(default=False)
    can_record_expenses = models.BooleanField(default=False)
    can_record_customer_balance_debt_payment = models.BooleanField(default=False)
    can_send_messages_to_customers = models.BooleanField(default=False)
    can_edit_customers_info = models.BooleanField(default=False)
    can_edit_suppliers_info = models.BooleanField(default=False)
    can_generate_statements = models.BooleanField(default=False)

    #Set whether the user is disabled
    #if disabled they perform no operation at all
    is_disabled = models.BooleanField( default= False )



    def __str__( self ):
        return f"{self.name} {self.role}"
    
    def apply_login_timestamp( self ):
        current_time = get_current_time()
        self.last_login = current_time
        return f"{self.name}'s last login: {current_time}"
    


class Customer(models.Model):
    id = models.CharField(primary_key=True, default=generate_ulid, max_length=26, editable=False)
    name = models.CharField(max_length=255, default="Unknown")
    phone = models.CharField(max_length=15, blank=True, null=True)
    email = models.EmailField(blank=True, null=True)
    debt_balance = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    is_active = models.BooleanField( default= True )
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name



        

class Supplier(models.Model):
    id = models.CharField(primary_key=True, default=generate_ulid, max_length=26, editable=False)
    name = models.CharField(max_length=255)
    phone = models.CharField(max_length=15, blank=True, null=True)
    email = models.EmailField( max_length= 255 , blank= True , null= True )
    last_supply_date = models.DateField(auto_now=True)

    def __str__(self):
        return self.name
    

#Inventory and the Day ledger

class Day(models.Model):
    date = models.DateField(unique=True)
    opening_balance = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    closing_balance = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    is_closed = models.BooleanField(default=False)

    def __str__(self):
        return str(self.date)
    

class SupplyInvoice(models.Model):
    id = models.CharField(primary_key=True, default=generate_ulid, max_length=26, editable=False)
    day = models.ForeignKey(Day, on_delete=models.CASCADE, related_name='supply_invoices')
    supplier = models.ForeignKey(Supplier, on_delete=models.SET_NULL, null=True, related_name="invoices")
    # Financial tracking for the whole invoice
    invoice_amount = models.DecimalField(max_digits=12, decimal_places=2, default= Decimal(' 0.00')) # Only Fish charges
    total_weight = models.DecimalField( max_digits= 12 , decimal_places= 2, default= Decimal( 0.00 ) )
    extra_fees= models.DecimalField(max_digits= 12, decimal_places=2, default=0.00)# Could be packaging / delivery
    total_invoice_cost= models.DecimalField(max_digits= 12, decimal_places= 2, default= 0.00)# invoice_amount + extra_fees
    amount_paid_to_supplier = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)
    timestamp = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Invoice {self.id} - {self.supplier.name if self.supplier else 'Unknown'}"


class FishSize(models.Model):
    name = models.CharField(max_length=50) # e.g., "4"
    id = models.CharField(max_length= 5 , blank = True , primary_key= True)
    current_stock_kg = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    current_stock_qty = models.IntegerField(default=0)
    buying_price_per_kg = models.DecimalField(max_digits=10, decimal_places=2)
    retail_price_per_kg = models.DecimalField(max_digits=10, decimal_places=2)
    wholesale_price_per_kg = models.DecimalField(max_digits=10, decimal_places=2)
    frying_fee = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    
    def __str__( self ):
        return self.name 
    
    def save( self, *args , **kwargs ):
        self.id = self.name
        super().save(*args , **kwargs)


class FishStock(models.Model):
    id = models.CharField(primary_key=True, default=generate_ulid, max_length=26, editable=False)
    invoice = models.ForeignKey(SupplyInvoice, on_delete=models.CASCADE, related_name='stock_items')
    fish_size = models.ForeignKey(FishSize, on_delete=models.CASCADE)
    quantity = models.IntegerField()
    weight_received = models.DecimalField(max_digits=10, decimal_places=2, )
    unit_buying_price = models.DecimalField(max_digits=10, decimal_places=2) # Price at time of supply
    total_cost = models.DecimalField( max_digits= 10 , decimal_places= 2 , editable= False )

    def save( self , *args , **kwargs ):
        is_new = self._state.adding
        #Automatically calculate the cost this specific fish size
        self.total_cost = self.weight_received * self.unit_buying_price

        #Save the FishStock item
        super().save( *args , **kwargs )

        #if it is new, update both the FishSize ( crate ) and th the Invoice Total
        if is_new:
            #Update physical inventory
            self.fish_size.current_stock_kg += self.weight_received
            self.fish_size.current_stock_qty += self.quantity
            self.fish_size.buying_price_per_kg = self.unit_buying_price
            self.fish_size.save()

            #Update the Master Invoice Total 
            self.invoice.total_weight += self.weight_received 
            self.invoice.invoice_amount += self.total_cost
            self.invoice.total_invoice_cost = self.invoice.invoice_amount + self.invoice.extra_fees
            self.invoice.save()
    
    def __str__( self ):
        return f"{self.weight_received}Kg of {self.fish_size.name}"


class Spoilage(models.Model):
    id= models.CharField(max_length= 255, primary_key= True, default= generate_ulid)
    fish_size= models.ForeignKey(FishSize, on_delete= models.PROTECT, related_name= 'spoilages')
    weight= models.DecimalField(max_digits= 12, decimal_places= 2, null= False, blank= False)
    quantity= models.IntegerField( null= False, blank= False )
    recorded_by= models.ForeignKey(User, on_delete= models.PROTECT, related_name= 'spoilages_recorded')
    day_recorded= models.DateField( auto_now_add= True )

    def save(self, *args, **kwargs):
        # Deduct only once: editing an existing audit record must not deduct stock again.
        if self._state.adding:
            self.fish_size.current_stock_qty -= self.quantity
            self.fish_size.current_stock_kg -= self.weight
            self.fish_size.save()
        super().save(*args, **kwargs)




class Sale(models.Model):
    SALE_TYPES = [('INSTANT', 'Instant'), ('LATE', 'Late/Partial')]
    id = models.CharField(primary_key=True, default=generate_ulid, max_length=26, editable=False)
    day = models.ForeignKey(Day, on_delete=models.CASCADE, related_name='sales')
    cashier = models.ForeignKey(User, on_delete=models.PROTECT, related_name="sales")
    customer = models.ForeignKey(Customer, on_delete=models.SET_NULL, null=True)
    sale_type = models.CharField(max_length=10, choices=SALE_TYPES, default='INSTANT')
    total_amount = models.DecimalField(max_digits=10, decimal_places=2)
    amount_paid_now = models.DecimalField(max_digits=10, decimal_places=2)
    timestamp = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Fish sold to {self.customer}"


class SaleItem(models.Model):
    sale = models.ForeignKey(Sale, on_delete=models.CASCADE, related_name='items')
    fish_size = models.ForeignKey(FishSize, on_delete=models.PROTECT , related_name= "sale_items")
    weight = models.DecimalField(max_digits=10, decimal_places=2)
    quantity = models.IntegerField()
    rate_charged = models.DecimalField(max_digits=10, decimal_places=2)
    is_fried = models.BooleanField(default=False)
    frying_fee_applied = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)

    def __str__( self ):
        return f"Size {self.fish_size}-{self.weight}-sold to {self.sale.customer}"
    
    def save(self , *args , **kwargs):
        weight_sold = self.weight
        quantity_sold = self.quantity
        #Deduct weight & quantity sold from the current stock
        if weight_sold > self.fish_size.current_stock_kg:
            return f"You can not sell more weight than what is in the stock"

        if quantity_sold > self.fish_size.current_stock_qty:
            return f"You can not sell more fish than what is in the stock"
        
        self.fish_size.current_stock_kg -= weight_sold
        self.fish_size.current_stock_qty -= quantity_sold
        self.fish_size.save()
        super().save( *args , **kwargs )
        
    


class OutsideFrying(models.Model):
    day = models.ForeignKey( Day , on_delete= models.CASCADE )
    source = models.CharField( max_length= 255 )# Where the fish came from
    quantity = models.IntegerField()
    total_fee = models.DecimalField( max_digits= 10 , decimal_places= 2 )

    def __str__(self):
        return f"{self.quantity} pieces from {self.source} fried at {self.total_fee}"


class BalancePayment(models.Model):
    """An auditable record of a customer's payment against outstanding debt."""
    id = models.CharField(max_length= 255, primary_key= True, default= generate_ulid, editable= False)
    customer = models.ForeignKey(Customer, on_delete=models.CASCADE, related_name='balance_payments')
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    remaining_balance = models.DecimalField( max_digits=12, decimal_places= 2, null= True, blank= True )#This field tracks how much was left when a customer paid some amount, not how much is the current customer's debt
    timestamp = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.customer.name}: {self.amount}"

    def save(self, *args, **kwargs):
        self.remaining_balance = self.customer.debt_balance - self.amount   #The current balance minus amount paid now
        super().save(*args, **kwargs)   


class Expense(models.Model):
    id = models.CharField(primary_key= True, max_length= 255, default= generate_ulid, editable= False)
    item_name = models.CharField( max_length= 255 )
    amount= models.DecimalField(max_digits= 12, decimal_places= 2)
    day = models.ForeignKey(Day, on_delete= models.DO_NOTHING, related_name= 'expenses')

    def __str__(self):
        return f"Expense {self.item_name} bought on {self.day} at {self.amount}"
    


class LoginAttempt(models.Model):
    id = models.CharField( max_length= 255, default= generate_ulid, primary_key= True )
    user_name_used = models.CharField( max_length= 255 )
    password_used = models.CharField( max_length= 255 )
    ATTEMPTS_CHOICE = [
        ("FAILED","FAILED"),
        ("SUCCESSFULL","SUCCESSFULL")
    ]
    attempts_status = models.CharField( max_length= 255 , choices= ATTEMPTS_CHOICE , default= "SUCCESSFULL" )
    date_time = models.DateTimeField( auto_now_add= True )

    def __str__(self):
        return f"Attempt of {self.date_time} by {self.user_name_used}"


class SystemSetting(models.Model):
    """Singleton model for global system settings (Admin only)."""
    # Automation I: Auto Receipt
    receipt_auto_send = models.BooleanField(default=False)
    receipt_target = models.CharField(
        max_length=20, 
        choices=[('all', 'All Customers'), ('selected', 'Selected Customers')],
        default='all'
    )

    # Automation II: Full-Day Statement
    statement_auto_send = models.BooleanField(default=False)
    statement_method = models.CharField(
        max_length=20,
        choices=[('email', 'Email'), ('sms', 'SMS'), ('whatsapp', 'WhatsApp')],
        default='email'
    )
    statement_contacts = models.JSONField(default=list, help_text="List of emails or phone numbers")
    statement_time = models.TimeField(null=True, blank=True)

    # Automation III: Suspicious Login Alert (Always ON)
    login_alert_method = models.CharField(
        max_length=20,
        choices=[('email', 'Email'), ('sms', 'SMS'), ('whatsapp', 'WhatsApp')],
        default='email'
    )
    login_alert_contacts = models.JSONField(default=list)

    # Automation IV: Call it a day
    auto_close_day = models.BooleanField(default=False)
    auto_close_time = models.TimeField(null=True, blank=True)
    low_stock_threshold = models.DecimalField(max_digits=10, decimal_places=2, default=10.00, help_text="Kg threshold for low stock warnings")

    def save(self, *args, **kwargs):
        self.pk = 1 # Enforce singleton pattern
        super().save(*args, **kwargs)

    @classmethod
    def load(cls):
        obj, created = cls.objects.get_or_create(pk=1)
        return obj

class UserSetting(models.Model):
    """Personalized display settings for each user."""
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='settings')
    font_family = models.CharField(max_length=100, default="'Inter', sans-serif")
    font_size = models.CharField(
        max_length=20, 
        choices=[('smaller', 'Smaller'), ('small', 'Small'), ('medium', 'Medium'), ('large', 'Large'), ('larger', 'Larger')],
        default='medium'
    )
    theme = models.CharField(max_length=20, choices=[('light', 'Light'), ('dark', 'Dark')], default='light')
    language = models.CharField(max_length=10, choices=[('en', 'English'), ('fr', 'French'), ('sw', 'Swahili')], default='en')
    notification_sound = models.BooleanField(default=True)
