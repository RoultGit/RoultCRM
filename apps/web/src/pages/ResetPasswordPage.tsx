import { useState } from 'react';
import { isAxiosError } from 'axios';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import { Card } from '../components/ui/card.js';
import { Button } from '../components/ui/button.js';
import { useResetWithToken } from '../hooks/useForgotPassword.js';

const MIN_LENGTH = 12;

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') ?? '';
  const reset = useResetWithToken();
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [done, setDone] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  const field = 'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm';
  const tooShort = next.length > 0 && next.length < MIN_LENGTH;
  const mismatch = repeat.length > 0 && next !== repeat;
  const canSubmit = next.length >= MIN_LENGTH && next === repeat && !reset.isPending;

  // Sin token la página no tiene nada que hacer, y dejar el formulario a la vista haría escribir una
  // contraseña para después fallar. Se dice de entrada.
  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface p-4">
        <Card className="w-full max-w-sm p-6">
          <h1 className="mb-2 text-xl font-semibold">Link incompleto</h1>
          <p className="mb-6 text-sm text-gray-600">
            Este link no trae el código de verificación. Pedí uno nuevo desde la pantalla de ingreso.
          </p>
          <Link to="/forgot-password">
            <Button className="w-full">Pedir un link nuevo</Button>
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface p-4">
      <Card className="w-full max-w-sm p-6">
        {done ? (
          <>
            <CheckCircle2 className="mb-3 h-6 w-6 text-emerald-600" />
            <h1 className="mb-2 text-xl font-semibold">Listo</h1>
            <p className="mb-6 text-sm text-gray-600">
              Tu contraseña quedó cambiada y se cerraron todas las sesiones que había abiertas.
            </p>
            <Button className="w-full" onClick={() => navigate('/login')}>
              Ingresar
            </Button>
          </>
        ) : (
          <>
            <h1 className="mb-2 text-xl font-semibold">Elegí tu contraseña nueva</h1>
            <p className="mb-4 text-sm text-gray-600">
              Al guardarla se cierran todas las sesiones abiertas en cualquier dispositivo.
            </p>
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                setFailed(null);
                reset.mutate(
                  { token, newPassword: next },
                  {
                    onSuccess: () => setDone(true),
                    // Un 429 NO es un link vencido. Decir que venció manda a pedir otro, que
                    // también va a fallar por el mismo límite: la persona queda en un bucle sin
                    // entender por qué. El 401 sí es link muerto o ya usado.
                    onError: (err) =>
                      setFailed(
                        isAxiosError(err) && err.response?.status === 429
                          ? 'Demasiados intentos seguidos. Esperá unos minutos y volvé a probar con este mismo link.'
                          : 'El link no es válido o ya venció. Pedí uno nuevo desde la pantalla de ingreso.'
                      ),
                  }
                );
              }}
            >
              <input
                className={field}
                type="password"
                autoComplete="new-password"
                autoFocus
                placeholder="Contraseña nueva"
                value={next}
                onChange={(e) => setNext(e.target.value)}
              />
              <input
                className={field}
                type="password"
                autoComplete="new-password"
                placeholder="Repetila"
                value={repeat}
                onChange={(e) => setRepeat(e.target.value)}
              />
              {tooShort && (
                <p className="text-xs text-amber-700">Tiene que tener al menos {MIN_LENGTH} caracteres.</p>
              )}
              {mismatch && <p className="text-xs text-amber-700">Las dos contraseñas no coinciden.</p>}
              {failed && <p className="text-xs text-red-600">{failed}</p>}
              <Button type="submit" className="w-full" disabled={!canSubmit}>
                {reset.isPending ? 'Guardando…' : 'Guardar contraseña'}
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
