import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Building2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '../components/ui/button.js';
import { Card } from '../components/ui/card.js';
import { useLogin } from '../hooks/useAuth.js';

const loginSchema = z.object({
  email: z.string().email('Ingresa un correo válido'),
  password: z.string().min(1, 'Ingresa tu contraseña'),
});

type LoginForm = z.infer<typeof loginSchema>;

export function LoginPage() {
  const { register, handleSubmit, getValues, formState: { errors } } = useForm<LoginForm>({ resolver: zodResolver(loginSchema) });
  // Solo aparece cuando el mismo correo y contraseña sirven en más de una empresa. Es raro, pero
  // pasa: el dueño con dos negocios, o el contador que atiende a varios clientes.
  const [tenants, setTenants] = useState<{ id: string; name: string }[] | null>(null);
  const login = useLogin(setTenants);

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface">
      <Card className="w-full max-w-sm p-8">
        {tenants ? (
          <>
            <h1 className="mb-1 text-xl font-semibold">¿A cuál entrás?</h1>
            <p className="mb-5 text-sm text-gray-500">
              Tu correo tiene cuenta en más de una empresa. Cada una tiene sus propios datos.
            </p>
            <div className="space-y-2">
              {tenants.map((tenant) => (
                <button
                  key={tenant.id}
                  type="button"
                  disabled={login.isPending}
                  onClick={() => login.mutate({ ...getValues(), tenantId: tenant.id })}
                  className="flex w-full items-center gap-3 rounded-lg border border-gray-200 px-3 py-3 text-left text-sm font-medium text-gray-900 transition-colors hover:bg-gray-50 disabled:opacity-50"
                >
                  <Building2 className="h-4 w-4 shrink-0 text-gray-400" />
                  {tenant.name}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setTenants(null)}
              className="mt-4 w-full text-center text-sm text-gray-500 hover:text-gray-900"
            >
              Volver
            </button>
          </>
        ) : (
        <>
        <h1 className="mb-6 text-xl font-semibold">Ingresar a RoultCRM</h1>
        <form className="space-y-4" onSubmit={handleSubmit((data) => login.mutate(data))}>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Correo</label>
            <input
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              type="email"
              {...register('email')}
            />
            {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Contraseña</label>
            <input
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              type="password"
              {...register('password')}
            />
            {errors.password && <p className="mt-1 text-xs text-red-600">{errors.password.message}</p>}
          </div>
          {login.isError && <p className="text-xs text-red-600">Credenciales inválidas.</p>}
          <Button type="submit" className="w-full" disabled={login.isPending}>
            {login.isPending ? 'Ingresando…' : 'Ingresar'}
          </Button>
          <Link
            to="/forgot-password"
            className="block text-center text-sm text-gray-500 hover:text-gray-900"
          >
            ¿Olvidaste tu contraseña?
          </Link>
        </form>
        </>
        )}
      </Card>
    </div>
  );
}
