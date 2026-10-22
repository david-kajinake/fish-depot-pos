from django.urls import path , include
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import (
    TokenObtainPairView,
    TokenRefreshView,
)
from django.contrib.auth.views import LogoutView
from . views import (  
              TaskStatusView, UnifiedLoginView, JwtLogoutView, 
              CurrentUserView, SystemSettingView, 
              UserSettingView, UserProfileUpdateView, LoginAttemptViewSet
                     ) #API VIEWS
from .views import(
    UsersViewset,
    CustomerViewSet , FishViewSet, SaleViewSet, 
    SupplyInvoiceViewSet, DayViewSet , SupplierViewsSet , 
    OutsideFryingViewSet, ExpenseViewSet
) #VIEWSETS

router = DefaultRouter()
router.register(r'users',UsersViewset, basename= 'users'), 
router.register(r'customers',CustomerViewSet, basename="customers") ,
router.register(r'suppliers',SupplierViewsSet, basename="supplier") ,
router.register(r'supply-invoices',SupplyInvoiceViewSet)
router.register(r'sales',SaleViewSet) , 
router.register(r'outside-frying', OutsideFryingViewSet) , 
router.register(r'expenses', ExpenseViewSet, basename= "expenses" )
router.register(r'fish-sizes',FishViewSet) , 
router.register(r'days',DayViewSet),
router.register(r'login-attempts', LoginAttemptViewSet, basename='login-attempts'),


urlpatterns = [
    path('',include(router.urls)),    
    # SimpleJWT Authentication Endpoints
    path('auth/login/', UnifiedLoginView.as_view(), name='token_obtain_pair'),
    path('auth/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('auth/logout/', JwtLogoutView.as_view(), name='token_logout'),
    path('auth/me/', CurrentUserView.as_view(), name='current_user'),
    path('settings/system/', SystemSettingView.as_view(), name='system_settings'),
    path('settings/user/me/', UserSettingView.as_view(), name='user_settings'),
    path('users/profile/', UserProfileUpdateView.as_view(), name='user_profile'),
    #Task status
    path('tasks/status/<str:task_id>/', TaskStatusView.as_view(), name= "task_status")
]











































































































































































































































































































































