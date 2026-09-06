import { createBrowserRouter } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell.js';
import { LoginPage } from '../pages/LoginPage.js';
import { TeamPage } from '../pages/TeamPage.js';

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <div>Dashboard (próximamente)</div> },
      { path: 'team', element: <TeamPage /> },
    ],
  },
]);
