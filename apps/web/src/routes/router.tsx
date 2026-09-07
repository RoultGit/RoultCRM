import { createBrowserRouter } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell.js';
import { LoginPage } from '../pages/LoginPage.js';
import { TeamPage } from '../pages/TeamPage.js';
import { CompaniesPage } from '../pages/CompaniesPage.js';
import { ContactsPage } from '../pages/ContactsPage.js';
import { LeadsPage } from '../pages/LeadsPage.js';
import { DealsPage } from '../pages/DealsPage.js';
import { TasksPage } from '../pages/TasksPage.js';
import { AuditPage } from '../pages/AuditPage.js';
import { DashboardPage } from '../pages/DashboardPage.js';
import { ImportPage } from '../pages/ImportPage.js';

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'team', element: <TeamPage /> },
      { path: 'companies', element: <CompaniesPage /> },
      { path: 'contacts', element: <ContactsPage /> },
      { path: 'leads', element: <LeadsPage /> },
      { path: 'deals', element: <DealsPage /> },
      { path: 'tasks', element: <TasksPage /> },
      { path: 'audit', element: <AuditPage /> },
      { path: 'import', element: <ImportPage /> },
    ],
  },
]);
