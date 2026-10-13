from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from .models import (
                     User, Customer, Supplier , 
                     Day, SupplyInvoice, FishSize, 
                     FishStock, Sale , SaleItem, OutsideFrying , BalancePayment , Expense, LoginAttempt
                    )

class CustomUserAdmin(UserAdmin):
    # 1. Add your custom fields to the user editing screen
    fieldsets = UserAdmin.fieldsets + (
        ('POS Staff Info', {'fields': ('name', 'role', 'phone')}),
    )
    
    # 2. Make the admin list view more useful
    list_display = ('username', 'name', 'role', 'email', 'is_staff')
    
    # 3. Add custom fields to the "Add User" screen (optional but helpful)
    add_fieldsets = UserAdmin.add_fieldsets + (
        ('POS Staff Info', {'fields': ('name', 'role', 'phone')}),
    )

# Register the User model using our custom admin class
admin.site.register(User, CustomUserAdmin)

# Register your models here.
admin.site.register([
  Customer , Supplier , 
    Day, SupplyInvoice, FishSize, 
    FishStock, Sale, SaleItem, OutsideFrying , LoginAttempt, BalancePayment, Expense
])