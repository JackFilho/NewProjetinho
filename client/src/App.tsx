import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { GlobalSettingsProvider } from "@/components/global-settings-provider";
import AdminLayout from "@/components/layout/admin-layout";
import CompanyLayout from "./components/layout/company-layout";
import Login from "@/pages/login";
import CompanyLogin from "@/pages/company-login";
import CompanyDashboard from "@/pages/company-dashboard-new";
import CompanySettings from "@/pages/company-settings";
import CompanyServices from "@/pages/company-services";
import CompanyProfessionals from "@/pages/company-professionals";
import CompanyClients from "@/pages/company-clients";
import CompanyHealth from "@/pages/company-health";
import CompanyPatientProfile from "@/pages/company-patient-profile";
import CompanyReminders from "@/pages/company-reminders";
import CompanyReviews from "@/pages/company-reviews";
import CompanyMessages from "@/pages/company-messages";
import CompanyFinancial from "@/pages/company-financial";
import CompanyReports from "@/pages/company-reports";
import FinancialPasswordGate from "@/components/financial-password-gate";
import CompanySupport from "@/pages/company-support";
import CompanySubscriptionManagement from "@/pages/company-subscription-management";
import DashboardAppointments from "@/pages/dashboard-appointments";
import Dashboard from "@/pages/dashboard";
import Companies from "@/pages/companies";
import Plans from "@/pages/plans";
import Status from "@/pages/status";
import SettingsPage from "@/pages/settings";
import Admins from "@/pages/admins";
import AdminAlerts from "@/pages/admin-alerts";
import AdminTestSubscription from "@/pages/admin-test-subscription";
import AdminSubscriptions from "@/pages/admin-subscriptions";
import AdminSupport from "@/pages/admin-support";
import AdminPlanEmbed from "@/pages/admin-plan-embed";
import AdminAnalytics from "@/pages/admin-analytics";
import AdminTrainingVideos from "@/pages/admin-training-videos";
import Subscription from "@/pages/subscription";
import PublicReview from "@/pages/public-review";
import EmbedPlans from "@/pages/embed-plans";
import ProfessionalDashboard from "@/pages/professional-dashboard";
import ProfessionalLogin from "@/pages/professional-login";
import ProfessionalProfile from "@/pages/professional-profile";
import ProfessionalClients from "@/pages/professional-clients";
import Register from "@/pages/register";
import ThankYou from "@/pages/thank-you";
import ResetPassword from "@/pages/reset-password";
import NotFound from "@/pages/NotFound";

function Router() {
  return (
    <Switch>
      {/* Company Routes */}
      <Route path="/" component={CompanyLogin} />
      <Route path="/company" component={CompanyLogin} />
      <Route path="/company-login" component={CompanyLogin} />
      <Route path="/company/login" component={CompanyLogin} />
      <Route path="/company/auth/login" component={CompanyLogin} />

      {/* Professional Routes */}
      <Route path="/profissional/login" component={ProfessionalLogin} />
      <Route path="/profissional/dashboard" component={ProfessionalDashboard} />
      <Route path="/profissional/perfil" component={ProfessionalProfile} />
      <Route path="/profissional/clientes" component={ProfessionalClients} />

      {/* Registration Routes */}
      <Route path="/cadastro" component={Register} />
      <Route path="/register" component={Register} />

      {/* Thank You Page */}
      <Route path="/obrigado" component={ThankYou} />

      {/* Reset Password */}
      <Route path="/reset-password" component={ResetPassword} />

      {/* Company Dashboard Routes */}
      <Route path="/dashboard">
        <CompanyLayout>
          <CompanyDashboard />
        </CompanyLayout>
      </Route>
      <Route path="/company/dashboard">
        <CompanyLayout>
          <CompanyDashboard />
        </CompanyLayout>
      </Route>
      <Route path="/company/appointments">
        <CompanyLayout>
          <DashboardAppointments />
        </CompanyLayout>
      </Route>
      <Route path="/company/services">
        <CompanyLayout>
          <CompanyServices />
        </CompanyLayout>
      </Route>
      <Route path="/company/professionals">
        <CompanyLayout>
          <CompanyProfessionals />
        </CompanyLayout>
      </Route>
      <Route path="/company/clients">
        <CompanyLayout>
          <CompanyClients />
        </CompanyLayout>
      </Route>
      <Route path="/company/saude">
        <CompanyLayout>
          <CompanyHealth />
        </CompanyLayout>
      </Route>
      <Route path="/company/saude/paciente/:clientId">
        <CompanyLayout>
          <CompanyPatientProfile />
        </CompanyLayout>
      </Route>
      <Route path="/company/settings">
        <CompanyLayout>
          <CompanySettings />
        </CompanyLayout>
      </Route>
      <Route path="/company/reminders">
        <CompanyLayout>
          <CompanyReminders />
        </CompanyLayout>
      </Route>
      <Route path="/company/reviews">
        <CompanyLayout>
          <CompanyReviews />
        </CompanyLayout>
      </Route>
      <Route path="/company/messages">
        <CompanyLayout>
          <CompanyMessages />
        </CompanyLayout>
      </Route>
      <Route path="/company/financial">
        <CompanyLayout>
          <FinancialPasswordGate>
            <CompanyFinancial />
          </FinancialPasswordGate>
        </CompanyLayout>
      </Route>
      <Route path="/company/reports">
        <CompanyLayout>
          <FinancialPasswordGate>
            <CompanyReports />
          </FinancialPasswordGate>
        </CompanyLayout>
      </Route>
      <Route path="/company/relatorios">
        <CompanyLayout>
          <FinancialPasswordGate>
            <CompanyReports />
          </FinancialPasswordGate>
        </CompanyLayout>
      </Route>
      <Route path="/company/configuracoes">
        <CompanyLayout>
          <CompanySettings />
        </CompanyLayout>
      </Route>
      <Route path="/company/suporte">
        <CompanyLayout>
          <CompanySupport />
        </CompanyLayout>
      </Route>
      <Route path="/company/assinatura">
        <CompanyLayout>
          <CompanySubscriptionManagement />
        </CompanyLayout>
      </Route>

      {/* Public Routes */}
      <Route path="/assinatura" component={Subscription} />
      <Route path="/review/:token" component={PublicReview} />
      <Route path="/embed/plans" component={EmbedPlans} />

      {/* Admin Routes */}
      <Route path="/login" component={Login} />
      <Route path="/admin/login" component={Login} />
      <Route path="/administrador/login" component={Login} />

      <Route path="/administrador">
        <AdminLayout>
          <Dashboard />
        </AdminLayout>
      </Route>
      <Route path="/admin">
        <AdminLayout>
          <Dashboard />
        </AdminLayout>
      </Route>
      <Route path="/admin/dashboard">
        <AdminLayout>
          <Dashboard />
        </AdminLayout>
      </Route>
      <Route path="/administrador/dashboard">
        <AdminLayout>
          <Dashboard />
        </AdminLayout>
      </Route>
      <Route path="/admin/companies">
        <AdminLayout>
          <Companies />
        </AdminLayout>
      </Route>
      <Route path="/administrador/empresas">
        <AdminLayout>
          <Companies />
        </AdminLayout>
      </Route>
      <Route path="/admin/plans">
        <AdminLayout>
          <Plans />
        </AdminLayout>
      </Route>
      <Route path="/administrador/planos">
        <AdminLayout>
          <Plans />
        </AdminLayout>
      </Route>
      <Route path="/admin/status">
        <AdminLayout>
          <Status />
        </AdminLayout>
      </Route>
      <Route path="/administrador/status">
        <AdminLayout>
          <Status />
        </AdminLayout>
      </Route>
      <Route path="/admin/settings">
        <AdminLayout>
          <SettingsPage />
        </AdminLayout>
      </Route>
      <Route path="/administrador/configuracoes">
        <AdminLayout>
          <SettingsPage />
        </AdminLayout>
      </Route>
      <Route path="/admin/admins">
        <AdminLayout>
          <Admins />
        </AdminLayout>
      </Route>
      <Route path="/administrador/administradores">
        <AdminLayout>
          <Admins />
        </AdminLayout>
      </Route>
      <Route path="/admin/alerts">
        <AdminLayout>
          <AdminAlerts />
        </AdminLayout>
      </Route>
      <Route path="/administrador/alertas">
        <AdminLayout>
          <AdminAlerts />
        </AdminLayout>
      </Route>
      <Route path="/admin/subscriptions">
        <AdminLayout>
          <AdminSubscriptions />
        </AdminLayout>
      </Route>
      <Route path="/administrador/assinaturas">
        <AdminLayout>
          <AdminSubscriptions />
        </AdminLayout>
      </Route>
      <Route path="/admin/support">
        <AdminLayout>
          <AdminSupport />
        </AdminLayout>
      </Route>
      <Route path="/administrador/suporte">
        <AdminLayout>
          <AdminSupport />
        </AdminLayout>
      </Route>
      <Route path="/administrador/teste-assinatura">
        <AdminLayout>
          <AdminTestSubscription />
        </AdminLayout>
      </Route>
      <Route path="/administrador/treinamentos">
        <AdminLayout>
          <AdminTrainingVideos />
        </AdminLayout>
      </Route>
      <Route path="/administrador/embed-planos">
        <AdminLayout>
          <AdminPlanEmbed />
        </AdminLayout>
      </Route>
      <Route path="/admin/analytics">
        <AdminLayout>
          <AdminAnalytics />
        </AdminLayout>
      </Route>
      <Route path="/administrador/analytics">
        <AdminLayout>
          <AdminAnalytics />
        </AdminLayout>
      </Route>

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <GlobalSettingsProvider />
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;