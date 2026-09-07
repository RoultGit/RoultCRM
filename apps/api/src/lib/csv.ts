export interface CsvColumn<T> {
  key: keyof T & string;
  header: string;
}

// Serializar CSV bien son quince líneas y no vale una dependencia. Parsearlo es otra historia — eso
// pasa en el navegador con papaparse, porque comillas y saltos de línea embebidos sí tienen filo.
function escape(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv<T extends Record<string, unknown>>(rows: T[], columns: CsvColumn<T>[]): string {
  const header = columns.map((column) => escape(column.header)).join(',');
  const body = rows.map((row) => columns.map((column) => escape(row[column.key])).join(','));
  // CRLF es lo que Excel espera; con LF solo, algunas versiones meten todo en una fila.
  return [header, ...body].join('\r\n');
}

// Excel abre el archivo en la codificación local salvo que encuentre el BOM; sin él "Pérez" sale
// como "PÃ©rez" en cualquier Windows en español.
export const UTF8_BOM = '﻿';
