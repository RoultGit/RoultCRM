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
  },
});
