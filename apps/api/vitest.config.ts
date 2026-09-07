import { defineConfig } from 'vitest/config';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Load .env.test
const envTestPath = resolve(__dirname, '.env.test');
const envContent = readFileSync(envTestPath, 'utf-8');
envContent.split('\n').forEach((line) => {
  const match = line.match(/^([^=]+)="(.+)"$/);
  if (match) {
    process.env[match[1]] = match[2];
  }
});

export default defineConfig({
  test: {
    environment: 'node',
    // Todos los archivos comparten el mismo Postgres de pruebas, y User.email es único a nivel
    // global (no por tenant). Corriéndolos en paralelo se pisan entre sí y la suite falla de
    // forma intermitente sin que haya nada roto en el código.
    fileParallelism: false,
  },
});
