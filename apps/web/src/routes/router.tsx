import { createBrowserRouter } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell.js';
import { LoginPage } from '../pages/LoginPage.js';
import { ForgotPasswordPage } from '../pages/ForgotPasswordPage.js';
import { ResetPasswordPage } from '../pages/ResetPasswordPage.js';
import { TeamPage } from '../pages/TeamPage.js';
import { CompaniesPage } from '../pages/CompaniesPage.js';
import { CompanyDetailPage } from '../pages/CompanyDetailPage.js';
import { ContactsPage } from '../pages/ContactsPage.js';
import { LeadsPage } from '../pages/LeadsPage.js';
import { DealsPage } from '../pages/DealsPage.js';
import { TasksPage } from '../pages/TasksPage.js';
import { CalendarPage } from '../pages/CalendarPage.js';
import { TenantsPage } from '../pages/TenantsPage.js';
import { IntegrationsPage } from '../pages/IntegrationsPage.js';
import { CustomFieldsPage } from '../pages/CustomFieldsPage.js';
import { AutomationsPage } from '../pages/AutomationsPage.js';
import { QuotesPage } from '../pages/QuotesPage.js';
import { PublicQuotePage } from '../pages/PublicQuotePage.js';
import { AuditPage } from '../pages/AuditPage.js';
import { DashboardPage } from '../pages/DashboardPage.js';
import { ImportPage } from '../pages/ImportPage.js';
import { AdminOnly } from '../components/AdminOnly.js';
import { NotFoundPage } from '../pages/NotFoundPage.js';

export const router = createBrowserRouter([
  // Públicas: quien olvidó su contraseña no tiene sesión, así que no pueden colgar de AppShell.
  { path: '/login', element: <LoginPage /> },
  { path: '/forgot-password', element: <ForgotPasswordPage /> },
  { path: '/reset-password', element: <ResetPasswordPage /> },
  // La cotización que abre el cliente: sin sesión y fuera del AppShell, porque quien la abre no
  // tiene cuenta y no tiene por qué ver nada del CRM.
  { path: '/cotizacion/:token', element: <PublicQuotePage /> },
  {
    path: '/',
    element: <AppShell />,
    errorElement: <NotFoundPage />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'team', element: <TeamPage /> },
      { path: 'companies', element: <CompaniesPage /> },
      { path: 'companies/:id', element: <CompanyDetailPage /> },
      { path: 'contacts', element: <ContactsPage /> },
      { path: 'leads', element: <LeadsPage /> },
      { path: 'deals', element: <DealsPage /> },
      { path: 'quotes', element: <QuotesPage /> },
      { path: 'tasks', element: <TasksPage /> },
      { path: 'calendar', element: <CalendarPage /> },
      { path: 'automations', element: <AutomationsPage /> },
      { path: 'tenants', element: <TenantsPage /> },
      {
        path: 'integrations',
        element: (
          <AdminOnly>
            <IntegrationsPage />
          </AdminOnly>
        ),
      },
      {
        path: 'custom-fields',
        element: (
          <AdminOnly>
            <CustomFieldsPage />
          </AdminOnly>
        ),
      },
      {
        path: 'audit',
        element: (
          <AdminOnly>
            <AuditPage />
          </AdminOnly>
        ),
      },
      { path: '*', element: <NotFoundPage /> },
      {
        path: 'import',
        element: (
          <AdminOnly>
            <ImportPage />
          </AdminOnly>
        ),
      },
    ],
  },
]);
