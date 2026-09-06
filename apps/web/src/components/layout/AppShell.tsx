import { NavLink, Outlet } from 'react-router-dom';
import { LayoutDashboard, Users, Building2, Contact, Handshake, ListChecks, CalendarClock, Settings } from 'lucide-react';
import { cn } from '../../lib/cn.js';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/leads', label: 'Leads', icon: Handshake },
  { to: '/deals', label: 'Deals', icon: ListChecks },
  { to: '/companies', label: 'Empresas', icon: Building2 },
  { to: '/contacts', label: 'Contactos', icon: Contact },
  { to: '/team', label: 'Vendedores', icon: Users },
  { to: '/tasks', label: 'Tareas', icon: CalendarClock },
  { to: '/settings', label: 'Configuración', icon: Settings },
];

export function AppShell() {
  return (
    <div className="flex min-h-screen bg-surface">
      <aside className="w-60 shrink-0 border-r border-gray-200 bg-white p-4">
        <div className="mb-6 px-2 text-lg font-semibold">VentryCRM</div>
        <nav className="space-y-1">
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100',
                  isActive && 'bg-gray-900 text-white hover:bg-gray-900'
                )
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="flex-1 p-6">
        <Outlet />
      </main>
    </div>
  );
}
