from django.urls import path
from django.contrib.auth.views import LogoutView
from . import  views


urlpatterns=[
    path('', views.home, name= 'home'),
    path('login/', views.user_login, name= "user_login"),
    path('logout/', views.user_logout, name="user_logout"),
    path('sales/', views.sales, name='sales'),
    path('inventory/', views.inventory, name= 'inventory'),
    path('expenses/',views.expenses, name= 'expenses'),
    path('expenses/<str:expense_id>/', views.expense_details, name='expense_details'),
    path('customers/', views.customers, name= 'customers'),
    path('customers/<str:customer_id>/', views.customer_details, name='customer_details'),
    path('settings/', views.settings, name= "settings"),
    path('settings/users/<str:user_id>/', views.user_details, name='user_details'),
    path('suppliers/', views.suppliers, name= 'suppliers'),
    path('suppliers/<str:supplier_id>/', views.supplier_details, name = 'supplier_details'),
]
