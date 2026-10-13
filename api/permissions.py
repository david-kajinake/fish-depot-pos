from rest_framework.permissions import BasePermission
"""
Admins and Super users can override these permissions. ( they are granted all permissions )
"""
class CanCallItADay(BasePermission):
    def has_permission(self, request, view):
        is_admin_or_superuser = request.user.role == 'ADMIN' or request.user.is_superuser
        has_been_granted_permission = request.user and request.user.can_call_it_a_day
        return is_admin_or_superuser or has_been_granted_permission

class canRecordSale(BasePermission):
    def has_permission(self, request, view):
        is_admin_or_superuser = request.user.role == 'ADMIN' or request.user.is_superuser
        has_been_granted_permission = request.user and request.user.can_record_sale
        return is_admin_or_superuser or has_been_granted_permission

class CanRecordStockSupply(BasePermission):
    def has_permission(self, request, view):
        is_admin_or_superuser = request.user.role == 'ADMIN' or request.user.is_superuser
        has_been_granted_permission = request.user and request.user.can_record_supply
        return is_admin_or_superuser or has_been_granted_permission

class CanRecordExpenses(BasePermission):
    def has_permission(self, request, view):
        is_admin_or_superuser = request.user.role == 'ADMIN' or request.user.is_superuser
        has_been_granted_permission = request.user and request.user.can_record_expenses
        return is_admin_or_superuser or has_been_granted_permission

class CanRecordCustomerBalanceDebt(BasePermission):
    def has_permission(self, request, view):
        is_admin_or_superuser = request.user.role == 'ADMIN' or request.user.is_superuser
        has_been_granted_permission = request.user and request.user.can_record_customer_balance_debt
        return is_admin_or_superuser or has_been_granted_permission

class CanSendMessagesToCustomers(BasePermission):
    def has_permission(self, request, view):
        is_admin_or_superuser = request.user.role == 'ADMIN' or request.user.is_superuser
        has_been_granted_permission = request.user and request.user.can_send_messages_to_customers
        return is_admin_or_superuser or has_been_granted_permission

class CanEditCustomersInfo(BasePermission):
    def has_permission(self, request, view):
        is_admin_or_superuser = request.user.role == 'ADMIN' or request.user.is_superuser
        has_been_granted_permission = request.user and request.user.can_edit_customers_info
        return is_admin_or_superuser or has_been_granted_permission

class CanEditSuppliersInfo(BasePermission):
    def has_permission(self, request, view):
        is_admin_or_superuser = request.user.role == 'ADMIN' or request.user.is_superuser
        has_been_granted_permission = request.user and request.user.can_edit_suppliers_info
        return is_admin_or_superuser or has_been_granted_permission

class CanGenerateStatements(BasePermission):
    def has_permission(self, request, view):
        is_admin_or_superuser = request.user.role == 'ADMIN' or request.user.is_superuser
        has_been_granted_permission = request.user and request.user.can_generate_statements
        return is_admin_or_superuser or has_been_granted_permission