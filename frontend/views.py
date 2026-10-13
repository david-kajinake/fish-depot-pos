from django.shortcuts import render
from django.http import HttpResponse

# Create your views here.

def home(request):
    return render(request, 'frontend/home.html')

def user_login(request):
    return render(request, 'authentication/login.html')

def user_logout(request):
    return render(request, 'authentication/login.html')

def sales(request):
    return render(request, 'frontend/sales.html')

def inventory(request):
    return render(request, 'frontend/inventory.html')

def expenses(request):
    return render(request, 'frontend/expenses.html')

def customers(request):
    return render(request, 'frontend/customers.html')

def customer_details(request, customer_id):
    return render(request, 'frontend/customer-details.html')

def settings(request):
    return render(request, 'frontend/settings.html')

def suppliers(request):
    return render(request, 'frontend/suppliers.html')

def supplier_details(request, supplier_id):
    return render(request, 'frontend/supplier-details.html')
