import { useState } from 'react';
import { isAxiosError } from 'axios';
import { Link } from 'react-router-dom';
import { MailCheck } from 'lucide-react';
import { Card } from '../components/ui/card.js';
import { Button } from '../components/ui/button.js';
import { useForgotPassword } from '../hooks/useForgotPassword.js';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const forgot = useForgotPassword();
  const field = 'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm';

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface p-4">
      <Card className="w-full max-w-sm p-6">
        {sent ? (
          <>
            <MailCheck className="mb-3 h-6 w-6 text-gray-400" />
            <h1 className="mb-2 text-xl font-semibold">Revisá tu correo</h1>
            {/* El mensaje es el mismo exista o no la cuenta. Decir "ese correo no está registrado"
                convertiría esta pantalla en una forma de averiguar quién usa el sistema — que en un
                CRM es la lista de clientes de la empresa. */}
            <p className="mb-1 text-sm text-gray-600">
              Si <strong>{email}</strong> tiene una cuenta, le mandamos un link para elegir una
              contraseña nueva.
            </p>
            <p className="mb-6 text-sm text-gray-500">
              El link vence en 1 hora. Si no llega, mirá en spam.
            </p>
            <Link to="/login">
              <Button variant="outline" className="w-full">
                Volver a ingresar
              </Button>
            </Link>
          </>
        ) : (
          <>
            <h1 className="mb-2 text-xl font-semibold">¿Olvidaste tu contraseña?</h1>
            <p className="mb-4 text-sm text-gray-600">
              Poné tu correo y te mandamos un link para elegir una nueva.
            </p>
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                forgot.mutate(email, { onSuccess: () => setSent(true) });
              }}
            >
              <input
                className={field}
                type="email"
                required
                autoFocus
                placeholder="tu@correo.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              {forgot.isError && (
                <p className="text-xs text-red-600">
                  {isAxiosError(forgot.error) && forgot.error.response?.status === 429
                    ? 'Ya pediste varios links seguidos. Esperá unos minutos; si te llegó alguno, todavía sirve el último.'
                    : 'No se pudo procesar el pedido. Probá de nuevo en unos minutos.'}
                </p>
              )}
              <Button type="submit" className="w-full" disabled={forgot.isPending}>
                {forgot.isPending ? 'Enviando…' : 'Enviarme el link'}
              </Button>
              <Link to="/login" className="block text-center text-sm text-gray-500 hover:text-gray-900">
                Volver
              </Link>
            </form>
          </>
        )}
      </Card>
    </div>
  );
}
