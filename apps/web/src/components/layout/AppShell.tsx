import { useState } from 'react';
import { NavLink, Outlet, Navigate } from 'react-router-dom';
import * as Dialog from '@radix-ui/react-dialog';
import { Building2, CalendarClock, CalendarDays, Contact, Handshake, History, Landmark, ListPlus, LayoutDashboard, ListChecks, LogOut, Menu, Plug, Upload, Users } from 'lucide-react';
import { cn } from '../../lib/cn.js';
import { useSession, useLogout } from '../../hooks/useAuth.js';
import { GlobalSearch } from './GlobalSearch.js';
import { ChangePasswordDialog } from '../ChangePasswordDialog.js';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/leads', label: 'Leads', icon: Handshake },
  { to: '/deals', label: 'Deals', icon: ListChecks },
  { to: '/companies', label: 'Empresas', icon: Building2 },
  { to: '/contacts', label: 'Contactos', icon: Contact },
  { to: '/team', label: 'Vendedores', icon: Users },
  { to: '/tasks', label: 'Tareas', icon: CalendarClock },
  { to: '/calendar', label: 'Calendario', icon: CalendarDays },
];
// ponytail: sin entrada de Configuración hasta que haya algo que configurar. Un link que lleva a
// un 404 es peor que no tener el link.

// Estas rutas responden 403 a un VENDEDOR, así que mostrarle el link sería ofrecerle una puerta
// cerrada.
const ADMIN_ONLY_NAV = [
  { to: '/custom-fields', label: 'Campos propios', icon: ListPlus },
  { to: '/integrations', label: 'Conexiones', icon: Plug },
  { to: '/import', label: 'Importar', icon: Upload },
  { to: '/audit', label: 'Auditoría', icon: History },
];

// Administrar empresas cliente es del dueño de la plataforma, no del admin de cada empresa: al
// admin de un cliente, mostrarle este link sería contarle que hay otros clientes.
const OWNER_ONLY_NAV = [{ to: '/tenants', label: 'Entidades', icon: Landmark }];

// El menú lateral se usa en dos lugares: fijo a la izquierda en pantallas grandes y dentro del
// cajón deslizante en el teléfono. Una sola definición para que no se desincronicen.
function SidebarNav({
  isAdmin,
  isOwner,
  onNavigate,
}: {
  isAdmin: boolean;
  isOwner: boolean;
  onNavigate?: () => void;
}) {
  return (
    <nav className="space-y-1">
      {[...NAV_ITEMS, ...(isAdmin ? ADMIN_ONLY_NAV : []), ...(isOwner ? OWNER_ONLY_NAV : [])].map(
        ({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              // min-h-11 = 44px, el mínimo para que un dedo acierte sin errarle al de al lado.
              'flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100',
              isActive && 'bg-gray-900 text-white hover:bg-gray-900'
            )
          }
        >
          <Icon size={18} />
          {label}
        </NavLink>
        )
      )}
    </nav>
  );
}

export function AppShell() {
  // Sin esto, entrar a cualquier ruta sin sesión (o tras vencer el refresh token) pintaba la app
  // entera vacía y en silencio: las queries daban 401 y cada tabla mostraba cero filas, que es
  // indistinguible de "no hay datos". useSession pasa por apiClient, así que un token de acceso
  // caído se renueva solo y solo llega acá si tampoco hay refresh válido.
  const session = useSession();
  const logout = useLogout();
  const [menuOpen, setMenuOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  if (session.isLoading) return <div className="p-6 text-sm text-gray-500">Cargando…</div>;
  if (session.isError) return <Navigate to="/login" replace />;

  const isAdmin = session.data?.role === 'ADMIN';
  const isOwner = session.data?.isPlatformOwner === true;

  return (
    <div className="flex min-h-screen bg-surface">
      {/* El lateral fijo desaparece por debajo de lg. Con 240px clavados, en un teléfono de 390px
          dejaba 150px para el contenido: no entraba nada y la página entera se scrolleaba de
          costado. Abajo de lg, el mismo menú vive en el cajón deslizante. */}
      <aside className="hidden w-60 shrink-0 border-r border-gray-200 bg-white p-4 lg:block">
        <div className="mb-6 px-2 text-lg font-semibold">RoultCRM</div>
        <SidebarNav isAdmin={isAdmin} isOwner={isOwner} />
      </aside>

      <main className="min-w-0 flex-1">
        <header className="flex items-center gap-3 border-b border-gray-200 bg-white px-4 py-3 sm:px-6">
          {/* Radix Dialog y no un div propio: trae el foco atrapado adentro, cerrar con Escape y el
              bloqueo del scroll de fondo, que es justo lo que hay que reimplementar mal si uno se
              arma el cajón a mano. */}
          <Dialog.Root open={menuOpen} onOpenChange={setMenuOpen}>
            <Dialog.Trigger asChild>
              <button
                type="button"
                aria-label="Abrir menú"
                className="-ml-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100 lg:hidden"
              >
                <Menu size={20} />
              </button>
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay className="fixed inset-0 z-40 bg-black/30 lg:hidden" />
              <Dialog.Content className="focus:outline-none fixed inset-y-0 left-0 z-50 w-64 overflow-y-auto border-r border-gray-200 bg-white p-4 shadow-xl lg:hidden">
                <Dialog.Title className="mb-6 px-2 text-lg font-semibold">RoultCRM</Dialog.Title>
                {/* Cerrar al navegar: si no, el cajón queda tapando la pantalla a la que acabás de
                    entrar y hay que cerrarlo a mano cada vez. */}
                <SidebarNav isAdmin={isAdmin} isOwner={isOwner} onNavigate={() => setMenuOpen(false)} />
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>

          <GlobalSearch />
          <div className="ml-auto flex shrink-0 items-center gap-3">
            {/* El nombre se oculta en pantalla chica: el botón de salir es lo que hace falta ahí. */}
            {/* El nombre es el acceso a la propia cuenta: es donde la gente busca "mis datos", y
                evita agregar otro ícono más a la barra. */}
            <button
              type="button"
              onClick={() => setPasswordOpen(true)}
              className="hidden rounded-lg px-2 py-1 text-sm text-gray-600 hover:bg-gray-100 hover:text-gray-900 sm:inline"
              title="Cambiar mi contraseña"
            >
              {session.data?.firstName} {session.data?.lastName}
            </button>
            <button
              type="button"
              className="flex min-h-11 items-center gap-1.5 rounded-lg px-2 py-1 text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-900"
              disabled={logout.isPending}
              onClick={() => logout.mutate()}
            >
              <LogOut size={16} />
              <span className="hidden sm:inline">Salir</span>
            </button>
          </div>
        </header>
        <div className="p-4 sm:p-6">
          <Outlet />
        </div>

        {/* forced: con una contraseña provisoria el diálogo no se puede cerrar. Si se pudiera
            esquivar, la contraseña que se pasó por WhatsApp quedaría viva y nada de esto serviría. */}
        <ChangePasswordDialog
          open={passwordOpen || session.data?.mustChangePassword === true}
          forced={session.data?.mustChangePassword === true}
          onClose={() => setPasswordOpen(false)}
        />
      </main>
    </div>
  );
}
