import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import PromptProvider from './components/common/CustomPrompt';
import SessionExpiryModal from './components/common/SessionExpiryModal';

// Layouts & Pages
import DashboardLayout from './components/layout/DashboardLayout';
import Login from './pages/Login/Login';

// Import CSS
import './styles/style.css';
import './styles/dashboard.css';

import DashboardHome from './pages/Dashboard/DashboardHome';
import Vendors from './pages/Dashboard/Vendors';
import Products from './pages/Dashboard/Products';
import Categories from './pages/Dashboard/Categories';
import Customers from './pages/Dashboard/Customers';
import KYCRequests from './pages/Dashboard/KYCRequests';
import Analytics from './pages/Dashboard/Analytics';
import VisitorAnalytics from './pages/Dashboard/VisitorAnalytics';
import Guests from './pages/Dashboard/Guests';
import ScrapedLinks from './pages/Dashboard/ScrapedLinks';
import Setting from './pages/Dashboard/Setting';
import PaymentMethods from './pages/Dashboard/PaymentMethods';
import TopUpRequests from './pages/Dashboard/TopUpRequests';
import AdminCampaigns from './pages/Dashboard/AdminCampaigns';
import SubscriptionPlans from './pages/Dashboard/SubscriptionPlans';
import VendorSubscriptions from './pages/Dashboard/VendorSubscriptions';
import BillingReports from './pages/Dashboard/BillingReports';

// Vendor Pages
import VendorHome from './pages/VendorDashboard/VendorHome';
import VendorProducts from './pages/VendorDashboard/VendorProducts';
import VendorProfile from './pages/VendorDashboard/VendorProfile';
import VendorWallet from './pages/VendorDashboard/VendorWallet';
import VendorCampaigns from './pages/VendorDashboard/VendorCampaigns';
import VendorCampaignDetail from './pages/VendorDashboard/VendorCampaignDetail';
import VendorSubscription from './pages/VendorDashboard/VendorSubscription';
import VendorCartDetails from './pages/VendorDashboard/VendorCartDetails';
import TopUpDetail from './pages/VendorDashboard/TopUpDetail';
import ProductDetail from './pages/VendorDashboard/ProductDetail';

// Storefront (customer-facing)
import StorefrontApp from './storefront/StorefrontApp';

// Protected Route Component with Role Check
const RoleProtectedRoute = ({ children, allowedRoles }) => {
  const { isAuthenticated, user, loading } = useAuth();

  if (loading) return <div>Loading...</div>;
  if (!isAuthenticated) return <Navigate to="/admin/login" replace />;
  if (allowedRoles && !allowedRoles.includes(user?.role)) {
    return <Navigate to={user?.role === 'VENDOR' ? '/admin/vendor-dashboard' : '/admin/dashboard'} replace />;
  }

  return children;
};

// Admin root redirect: send user to dashboard or login based on auth
const AdminHomeRedirect = () => {
  const { isAuthenticated, user, loading } = useAuth();
  if (loading) return <div>Loading...</div>;
  if (isAuthenticated) {
    return user?.role === 'VENDOR' ? <Navigate to="/admin/vendor-dashboard" replace /> : <Navigate to="/admin/dashboard" replace />;
  }
  return <Navigate to="/admin/login" replace />;
};

const App = () => {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <PromptProvider>
            <SessionExpiryModal />
            <Routes>
            <Route path="/admin" element={<AdminHomeRedirect />} />
            <Route path="/admin/login" element={<Login />} />
            <Route path="/admin/admin-dbits" element={<Login loginMode="admin" />} />

            {/* Admin Dashboard */}
            <Route path="/admin/dashboard" element={
              <RoleProtectedRoute allowedRoles={['ADMIN']}>
                <DashboardLayout />
              </RoleProtectedRoute>
            }>
              <Route index element={<DashboardHome />} />
              <Route path="kyc" element={<KYCRequests />} />
              <Route path="vendors" element={<Vendors />} />
              <Route path="products" element={<Products />} />
              <Route path="products/:id" element={<ProductDetail isAdminView />} />
              <Route path="customers" element={<Customers />} />
              <Route path="guests" element={<Guests />} />
              <Route path="categories" element={<Categories />} />
              <Route path="scraped-links" element={<ScrapedLinks />} />
              <Route path="analytics" element={<Analytics />} />
              <Route path="visitor-analytics" element={<VisitorAnalytics userRole="admin" />} />
              <Route path="payment-methods" element={<PaymentMethods />} />
              <Route path="topup-requests" element={<TopUpRequests />} />
              <Route path="topup-requests/:id" element={<TopUpDetail isAdminView />} />
              <Route path="campaigns" element={<AdminCampaigns />} />
              <Route path="campaigns/:id" element={<VendorCampaignDetail isAdminView />} />
              <Route path="subscription-plans" element={<SubscriptionPlans />} />
              <Route path="vendor-subscriptions" element={<VendorSubscriptions />} />
              <Route path="billing-reports" element={<BillingReports />} />
              <Route path="settings" element={<Setting />} />
            </Route>

            {/* Vendor Dashboard */}
            <Route path="/admin/vendor-dashboard" element={
              <RoleProtectedRoute allowedRoles={['VENDOR']}>
                <DashboardLayout />
              </RoleProtectedRoute>
            }>
              <Route index element={<VendorHome />} />
              <Route path="products" element={<VendorProducts />} />
              <Route path="products/:id" element={<ProductDetail />} />
              <Route path="analytics" element={<VisitorAnalytics userRole="vendor" />} />
              <Route path="wallet" element={<VendorWallet />} />
              <Route path="wallet/:id" element={<TopUpDetail />} />
              <Route path="campaigns" element={<VendorCampaigns />} />
              <Route path="campaigns/:id" element={<VendorCampaignDetail />} />
              <Route path="cart-details" element={<VendorCartDetails />} />
              <Route path="subscription" element={<VendorSubscription />} />
              <Route path="profile" element={<VendorProfile />} />
              <Route path="settings" element={<Setting />} />
            </Route>

            <Route path="/*" element={<StorefrontApp />} />
          </Routes>
          </PromptProvider>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
};

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
