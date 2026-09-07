import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import type { SearchResultDTO } from '@roult/shared';
import { useSearch } from '../../hooks/useSearch.js';

const TYPE_LABEL: Record<SearchResultDTO['type'], string> = {
  COMPANY: 'Empresa',
  CONTACT: 'Contacto',
  LEAD: 'Lead',
  DEAL: 'Deal',
  USER: 'Vendedor',
};

export function GlobalSearch() {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const { data: results, isFetching } = useSearch(query);

  // ⌘K / Ctrl+K enfoca el campo, que es lo que el spec técnico pedía para la topbar.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const go = (result: SearchResultDTO) => {
    setOpen(false);
    setQuery('');
    navigate(result.href);
  };

  return (
    <div className="relative w-96 max-w-full">
      <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
      <input
        ref={inputRef}
        className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm"
        placeholder="Buscar empresas, contactos, leads, deals… (⌘K)"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        // onMouseDown en los resultados corre antes que este blur, así que el clic llega igual.
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && query.trim().length >= 2 && (
        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
          {isFetching && !results ? (
            <p className="px-3 py-2 text-sm text-gray-500">Buscando…</p>
          ) : results && results.length > 0 ? (
            <ul>
              {results.map((result) => (
                <li key={`${result.type}-${result.id}`}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-gray-50"
                    onMouseDown={() => go(result)}
                  >
                    <span className="truncate">
                      <span className="text-gray-900">{result.label}</span>
                      {result.sublabel && <span className="ml-2 text-gray-500">{result.sublabel}</span>}
                    </span>
                    <span className="shrink-0 text-xs uppercase tracking-wide text-gray-400">
                      {TYPE_LABEL[result.type]}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-3 py-2 text-sm text-gray-500">Sin resultados para «{query.trim()}».</p>
          )}
        </div>
      )}
    </div>
  );
}
