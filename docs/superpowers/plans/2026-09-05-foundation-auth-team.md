# Foundation, Auth & Team (Vendedores) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the VentryCRM monorepo end-to-end — DB schema, JWT auth with refresh-token rotation, tenant seeding, and a working Users/Vendedores module (backend + frontend) — as the first working, testable slice of the F1 MVP.

**Architecture:** Monorepo (npm workspaces) with `apps/api` (Express + TS, layered routes→controller→service→repository, Prisma/Postgres) and `apps/web` (React + TS + Vite + Tailwind), sharing Zod schemas/types via `packages/shared`. Multi-tenant via `tenantId` on every row, enforced in the repository layer from the authenticated JWT — never from client input.

**Tech Stack:** Node 22, TypeScript 5, Express 4, Prisma 5 (Postgres/Supabase), Zod, jsonwebtoken, bcrypt, Vite 5, React 18, React Router 6, Tailwind CSS 3, Radix UI primitives (hand-rolled shadcn-style components), TanStack Query 5, TanStack Table 8, React Hook Form 7, Vitest 2, Supertest 7, Docker (Postgres for tests only).

**Spec:** `docs/superpowers/specs/2026-09-05-ventry-crm-mvp-design.md`

## Global Constraints

- Every table except `Tenant` has a required `tenantId`; every repository query is scoped by `tenantId` taken from `req.user` (JWT), never from request body/query params.
- Money is always `{ amount: Decimal, currency: 'PEN' | 'USD' }` — never a bare number, never summed across currencies.
- Passwords hashed with bcrypt (cost 12). Access tokens are JWT, 15 minutes. Refresh tokens are opaque random values, stored as a SHA-256 hash, 30 days, rotated on every use.
- No public tenant signup in the MVP — the only way to create a `Tenant` + first `ADMIN` user is the seed script.
- Frontend never talks to Supabase directly — only to `apps/api`.
- Design tokens: Tailwind `gray-50` app background, white cards (`rounded-xl`, `shadow-sm`, `border border-gray-200`), `gray-900` primary buttons/text, Inter font.

---

## Task 1: Monorepo scaffold

**Files:**
- Create: `package.json` (root, npm workspaces)
- Create: `tsconfig.base.json`
- Create: `apps/api/package.json`, `apps/api/tsconfig.json`
- Create: `apps/web/package.json`, `apps/web/tsconfig.json`, `apps/web/vite.config.ts`
- Create: `packages/shared/package.json`, `packages/shared/tsconfig.json`, `packages/shared/src/index.ts`
- Create: `.gitignore`
- Create: `.env.example`

**Interfaces:**
- Produces: workspace packages `@ventry/api`, `@ventry/web`, `@ventry/shared` importable as `@ventry/shared` from both apps.

- [ ] **Step 1: Root package.json with workspaces**

```json
{
  "name": "ventry-crm",
  "private": true,
  "workspaces": ["apps/*", "packages/*"],
  "scripts": {
    "dev:api": "npm run dev -w @ventry/api",
    "dev:web": "npm run dev -w @ventry/web",
    "build": "npm run build -w @ventry/shared && npm run build -w @ventry/api && npm run build -w @ventry/web",
    "test": "npm run test -w @ventry/api && npm run test -w @ventry/web"
  },
  "devDependencies": {
    "typescript": "^5.5.4"
  }
}
```

- [ ] **Step 2: Root tsconfig.base.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true
  }
}
```

- [ ] **Step 3: `.gitignore`**

```
node_modules/
dist/
build/
.env
.env.local
*.local
```

Note: `.env.test` is deliberately NOT ignored — it holds only fake, non-secret local test credentials (a throwaway Dockerized Postgres user/password, fake JWT secrets) and must be committed so a fresh clone can run the test suite. Only real per-developer secrets (`.env`, `.env.local`) are ignored.

- [ ] **Step 4: `.env.example`**

```
# apps/api
DATABASE_URL="postgresql://user:password@localhost:5432/ventry?schema=public"
JWT_ACCESS_SECRET="change-me-access"
JWT_REFRESH_PEPPER="change-me-refresh-pepper"
PORT=4000
ADMIN_TENANT_NAME="ROUlt"
ADMIN_EMAIL="admin@roult.pe"
ADMIN_PASSWORD="change-me-please"

# apps/web
VITE_API_URL="http://localhost:4000"
```

- [ ] **Step 5: `packages/shared` skeleton**

`packages/shared/package.json`:
```json
{
  "name": "@ventry/shared",
  "version": "0.0.1",
  "type": "module",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "dependencies": {
    "zod": "^3.23.8"
  }
}
```

`packages/shared/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src" },
  "include": ["src"]
}
```

`packages/shared/src/index.ts`:
```typescript
export const SHARED_PACKAGE_READY = true;
```

- [ ] **Step 6: `apps/api` scaffold**

`apps/api/package.json`:
```json
{
  "name": "@ventry/api",
  "version": "0.0.1",
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/server.js",
    "test": "vitest run"
  },
  "dependencies": {
    "@prisma/client": "^5.18.0",
    "@ventry/shared": "*",
    "bcrypt": "^5.1.1",
    "cors": "^2.8.5",
    "express": "^4.19.2",
    "jsonwebtoken": "^9.0.2",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/bcrypt": "^5.0.2",
    "@types/cors": "^2.8.17",
    "@types/express": "^4.17.21",
    "@types/jsonwebtoken": "^9.0.6",
    "@types/node": "^22.5.0",
    "@types/supertest": "^6.0.2",
    "prisma": "^5.18.0",
    "supertest": "^7.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5.5.4",
    "vitest": "^2.0.5"
  }
}
```

`apps/api/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src" },
  "include": ["src"]
}
```

`apps/api/src/server.ts`:
```typescript
import { createApp } from './app.js';

const app = createApp();
const port = process.env.PORT ? Number(process.env.PORT) : 4000;

app.listen(port, () => {
  console.log(`API listening on :${port}`);
});
```

`apps/api/src/app.ts`:
```typescript
import express, { type Express } from 'express';
import cors from 'cors';

export function createApp(): Express {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  return app;
}
```

- [ ] **Step 7: `apps/api` health check test**

`apps/api/src/app.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from './app.js';

describe('GET /health', () => {
  it('returns ok status', async () => {
    const app = createApp();
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
```

- [ ] **Step 8: `apps/web` scaffold via Vite**

Run: `npm create vite@latest apps/web -- --template react-ts` then delete the generated `apps/web/.git` if created, and replace `apps/web/package.json` name field with `@ventry/web`, adding `@ventry/shared` as a dependency (`"@ventry/shared": "*"`).

- [ ] **Step 9: Install all workspace dependencies**

Run: `npm install` (from repo root)
Expected: lockfile created, no errors.

- [ ] **Step 10: Run health check test**

Run: `npm run test -w @ventry/api`
Expected: PASS (1 test).

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "chore: scaffold monorepo (api, web, shared workspaces)"
```

---

## Task 2: Prisma schema and test database

**Files:**
- Create: `apps/api/prisma/schema.prisma`
- Create: `docker-compose.yml`
- Create: `apps/api/.env.test`
- Create: `apps/api/src/lib/prisma.ts`
- Test: `apps/api/src/lib/prisma.test.ts`

**Interfaces:**
- Produces: `prisma` singleton exported from `apps/api/src/lib/prisma.ts` as `export const prisma: PrismaClient`.
- Produces: Prisma models `Tenant`, `User` (fields: `id, tenantId, email, passwordHash, firstName, lastName, role, status, phone, avatarUrl, commissionPct, hireDate, createdAt, updatedAt`), `RefreshToken`, `AuditLog`.

- [ ] **Step 1: docker-compose.yml for test Postgres**

```yaml
services:
  db-test:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: ventry
      POSTGRES_PASSWORD: ventry
      POSTGRES_DB: ventry_test
    ports:
      - "55432:5432"
```

- [ ] **Step 2: `apps/api/.env.test`**

```
DATABASE_URL="postgresql://ventry:ventry@localhost:55432/ventry_test?schema=public"
JWT_ACCESS_SECRET="test-access-secret"
JWT_REFRESH_PEPPER="test-refresh-pepper"
```

- [ ] **Step 3: Write the Prisma schema**

`apps/api/prisma/schema.prisma`:
```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum UserRole {
  ADMIN
  VENDEDOR
}

enum UserStatus {
  ACTIVE
  INACTIVE
}

model Tenant {
  id        String   @id @default(uuid())
  name      String
  createdAt DateTime @default(now())

  users User[]
}

model User {
  id             String     @id @default(uuid())
  tenantId       String
  tenant         Tenant     @relation(fields: [tenantId], references: [id])
  email          String     @unique
  passwordHash   String
  firstName      String
  lastName       String
  role           UserRole
  status         UserStatus @default(ACTIVE)
  phone          String?
  avatarUrl      String?
  commissionPct  Decimal    @default(20) @db.Decimal(5, 2)
  hireDate       DateTime   @default(now())
  createdAt      DateTime   @default(now())
  updatedAt      DateTime   @updatedAt

  refreshTokens RefreshToken[]
  auditLogs     AuditLog[]

  @@index([tenantId])
}

model RefreshToken {
  id         String    @id @default(uuid())
  tenantId   String
  userId     String
  user       User      @relation(fields: [userId], references: [id])
  tokenHash  String    @unique
  userAgent  String?
  expiresAt  DateTime
  revokedAt  DateTime?
  createdAt  DateTime  @default(now())

  @@index([userId])
  @@index([tenantId])
}

model AuditLog {
  id         String   @id @default(uuid())
  tenantId   String
  userId     String
  user       User     @relation(fields: [userId], references: [id])
  action     String
  entityType String
  entityId   String
  before     Json?
  after      Json?
  createdAt  DateTime @default(now())

  @@index([tenantId, entityType, entityId])
}
```

- [ ] **Step 4: Prisma client singleton**

`apps/api/src/lib/prisma.ts`:
```typescript
import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();
```

- [ ] **Step 5: Start test DB and run first migration**

Run: `docker compose up -d db-test`
Run: `cd apps/api && cp .env.test .env && npx prisma migrate dev --name init`
Expected: migration files created under `apps/api/prisma/migrations/`, `Tenant`/`User`/`RefreshToken`/`AuditLog` tables exist in `ventry_test`.

- [ ] **Step 6: Write failing integration test for the Prisma connection**

`apps/api/src/lib/prisma.test.ts`:
```typescript
import { describe, it, expect, afterAll } from 'vitest';
import { prisma } from './prisma.js';

describe('prisma client', () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('can create and read a tenant', async () => {
    const tenant = await prisma.tenant.create({ data: { name: 'Test Tenant' } });
    const found = await prisma.tenant.findUniqueOrThrow({ where: { id: tenant.id } });
    expect(found.name).toBe('Test Tenant');
    await prisma.tenant.delete({ where: { id: tenant.id } });
  });
});
```

- [ ] **Step 7: Run the test**

Run: `npm run test -w @ventry/api`
Expected: PASS (2 tests total: health check + prisma).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add Prisma schema (Tenant, User, RefreshToken, AuditLog) and test DB"
```

---

## Task 3: Auth utilities (hashing, JWT, refresh token generation)

**Files:**
- Create: `apps/api/src/lib/password.ts`
- Create: `apps/api/src/lib/tokens.ts`
- Test: `apps/api/src/lib/password.test.ts`
- Test: `apps/api/src/lib/tokens.test.ts`

**Interfaces:**
- Produces: `hashPassword(plain: string): Promise<string>`, `verifyPassword(plain: string, hash: string): Promise<boolean>`.
- Produces: `signAccessToken(payload: { userId: string; tenantId: string; role: 'ADMIN' | 'VENDEDOR' }): string`, `verifyAccessToken(token: string): { userId: string; tenantId: string; role: 'ADMIN' | 'VENDEDOR' }`.
- Produces: `generateRefreshToken(): { token: string; tokenHash: string }`, `hashRefreshToken(token: string): string`.

- [ ] **Step 1: Write failing password tests**

`apps/api/src/lib/password.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from './password.js';

describe('password hashing', () => {
  it('hashes and verifies a correct password', async () => {
    const hash = await hashPassword('correct-horse');
    expect(await verifyPassword('correct-horse', hash)).toBe(true);
  });

  it('rejects an incorrect password', async () => {
    const hash = await hashPassword('correct-horse');
    expect(await verifyPassword('wrong-password', hash)).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm run test -w @ventry/api -- password.test`
Expected: FAIL (module `./password.js` not found).

- [ ] **Step 3: Implement password.ts**

```typescript
import bcrypt from 'bcrypt';

const SALT_ROUNDS = 12;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm run test -w @ventry/api -- password.test`
Expected: PASS (2 tests).

- [ ] **Step 5: Write failing token tests**

`apps/api/src/lib/tokens.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { signAccessToken, verifyAccessToken, generateRefreshToken, hashRefreshToken } from './tokens.js';

describe('access tokens', () => {
  it('round-trips the payload', () => {
    const token = signAccessToken({ userId: 'u1', tenantId: 't1', role: 'ADMIN' });
    const decoded = verifyAccessToken(token);
    expect(decoded).toMatchObject({ userId: 'u1', tenantId: 't1', role: 'ADMIN' });
  });

  it('throws on a tampered token', () => {
    const token = signAccessToken({ userId: 'u1', tenantId: 't1', role: 'ADMIN' });
    expect(() => verifyAccessToken(token + 'x')).toThrow();
  });
});

describe('refresh tokens', () => {
  it('generates a token whose hash matches hashRefreshToken', () => {
    const { token, tokenHash } = generateRefreshToken();
    expect(hashRefreshToken(token)).toBe(tokenHash);
  });

  it('generates different tokens each call', () => {
    const a = generateRefreshToken();
    const b = generateRefreshToken();
    expect(a.token).not.toBe(b.token);
  });
});
```

- [ ] **Step 6: Run to verify failure**

Run: `npm run test -w @ventry/api -- tokens.test`
Expected: FAIL (module not found).

- [ ] **Step 7: Implement tokens.ts**

```typescript
import jwt from 'jsonwebtoken';
import { randomBytes, createHash } from 'node:crypto';

export interface AccessTokenPayload {
  userId: string;
  tenantId: string;
  role: 'ADMIN' | 'VENDEDOR';
}

const ACCESS_TOKEN_TTL = '15m';

function getAccessSecret(): string {
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret) throw new Error('JWT_ACCESS_SECRET is not set');
  return secret;
}

function getRefreshPepper(): string {
  const pepper = process.env.JWT_REFRESH_PEPPER;
  if (!pepper) throw new Error('JWT_REFRESH_PEPPER is not set');
  return pepper;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, getAccessSecret(), { expiresIn: ACCESS_TOKEN_TTL });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, getAccessSecret()) as AccessTokenPayload;
}

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token + getRefreshPepper()).digest('hex');
}

export function generateRefreshToken(): { token: string; tokenHash: string } {
  const token = randomBytes(48).toString('hex');
  return { token, tokenHash: hashRefreshToken(token) };
}
```

- [ ] **Step 8: Run to verify pass**

Run: `npm run test -w @ventry/api -- tokens.test`
Expected: PASS (4 tests).

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: add password hashing and JWT/refresh token utilities"
```

---

## Task 4: Auth repository, service, and routes

**Files:**
- Create: `apps/api/src/modules/auth/auth.repository.ts`
- Create: `apps/api/src/modules/auth/auth.service.ts`
- Create: `apps/api/src/modules/auth/auth.routes.ts`
- Create: `apps/api/src/lib/errors.ts`
- Modify: `apps/api/src/app.ts` (mount auth routes + error middleware)
- Test: `apps/api/src/modules/auth/auth.service.test.ts`
- Test: `apps/api/src/modules/auth/auth.routes.test.ts`

**Interfaces:**
- Consumes: `hashPassword`, `verifyPassword` from `../../lib/password.js`; `signAccessToken`, `verifyAccessToken`, `generateRefreshToken`, `hashRefreshToken` from `../../lib/tokens.js`; `prisma` from `../../lib/prisma.js`.
- Produces: `AuthService.login(email, password): Promise<{ accessToken: string; refreshToken: string }>`, `AuthService.refresh(refreshToken: string): Promise<{ accessToken: string; refreshToken: string }>`, `AuthService.logout(refreshToken: string): Promise<void>`.
- Produces: `UnauthorizedError` from `../../lib/errors.js`, extended by later tasks (`NotFoundError`, `ForbiddenError`, `ValidationError`).
- Produces: Express router mounted at `/auth` with `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`.

- [ ] **Step 1: Error types**

`apps/api/src/lib/errors.ts`:
```typescript
export class AppError extends Error {
  constructor(message: string, public statusCode: number) {
    super(message);
    this.name = new.target.name;
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(message, 401);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Not found') {
    super(message, 404);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(message, 403);
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Validation failed') {
    super(message, 400);
  }
}
```

- [ ] **Step 2: Write failing auth service tests**

`apps/api/src/modules/auth/auth.service.test.ts`:
```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { prisma } from '../../lib/prisma.js';
import { hashPassword } from '../../lib/password.js';
import { AuthService } from './auth.service.js';
import { UnauthorizedError } from '../../lib/errors.js';

describe('AuthService', () => {
  let tenantId: string;

  beforeAll(async () => {
    const tenant = await prisma.tenant.create({ data: { name: 'Auth Test Tenant' } });
    tenantId = tenant.id;
  });

  afterAll(async () => {
    await prisma.refreshToken.deleteMany({ where: { user: { tenantId } } });
    await prisma.user.deleteMany({ where: { tenantId } });
    await prisma.tenant.delete({ where: { id: tenantId } });
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.refreshToken.deleteMany({ where: { user: { tenantId } } });
    await prisma.user.deleteMany({ where: { tenantId } });
    await prisma.user.create({
      data: {
        tenantId,
        email: 'admin@test.com',
        passwordHash: await hashPassword('secret123'),
        firstName: 'Admin',
        lastName: 'Test',
        role: 'ADMIN',
      },
    });
  });

  it('logs in with correct credentials and returns tokens', async () => {
    const result = await AuthService.login('admin@test.com', 'secret123');
    expect(result.accessToken).toBeTypeOf('string');
    expect(result.refreshToken).toBeTypeOf('string');
  });

  it('rejects an unknown email', async () => {
    await expect(AuthService.login('nobody@test.com', 'secret123')).rejects.toThrow(UnauthorizedError);
  });

  it('rejects a wrong password', async () => {
    await expect(AuthService.login('admin@test.com', 'wrong')).rejects.toThrow(UnauthorizedError);
  });

  it('refreshes and rotates the refresh token, invalidating the old one', async () => {
    const { refreshToken } = await AuthService.login('admin@test.com', 'secret123');
    const rotated = await AuthService.refresh(refreshToken);
    expect(rotated.refreshToken).not.toBe(refreshToken);
    await expect(AuthService.refresh(refreshToken)).rejects.toThrow(UnauthorizedError);
  });

  it('logout revokes the refresh token', async () => {
    const { refreshToken } = await AuthService.login('admin@test.com', 'secret123');
    await AuthService.logout(refreshToken);
    await expect(AuthService.refresh(refreshToken)).rejects.toThrow(UnauthorizedError);
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npm run test -w @ventry/api -- auth.service.test`
Expected: FAIL (modules not found).

- [ ] **Step 4: Implement auth repository**

`apps/api/src/modules/auth/auth.repository.ts`:
```typescript
import { prisma } from '../../lib/prisma.js';

export const AuthRepository = {
  findUserByEmail(email: string) {
    return prisma.user.findUnique({ where: { email } });
  },

  storeRefreshToken(tenantId: string, userId: string, tokenHash: string, expiresAt: Date) {
    return prisma.refreshToken.create({ data: { tenantId, userId, tokenHash, expiresAt } });
  },

  findActiveRefreshToken(tokenHash: string) {
    return prisma.refreshToken.findFirst({
      where: { tokenHash, revokedAt: null, expiresAt: { gt: new Date() } },
      include: { user: true },
    });
  },

  revokeRefreshToken(tokenHash: string) {
    return prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  },
};
```

- [ ] **Step 5: Implement auth service**

`apps/api/src/modules/auth/auth.service.ts`:
```typescript
import { verifyPassword } from '../../lib/password.js';
import { signAccessToken, generateRefreshToken, hashRefreshToken } from '../../lib/tokens.js';
import { UnauthorizedError } from '../../lib/errors.js';
import { AuthRepository } from './auth.repository.js';

const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

async function issueTokens(user: { id: string; tenantId: string; role: 'ADMIN' | 'VENDEDOR' }): Promise<TokenPair> {
  const accessToken = signAccessToken({ userId: user.id, tenantId: user.tenantId, role: user.role });
  const { token, tokenHash } = generateRefreshToken();
  await AuthRepository.storeRefreshToken(user.tenantId, user.id, tokenHash, new Date(Date.now() + REFRESH_TOKEN_TTL_MS));
  return { accessToken, refreshToken: token };
}

export const AuthService = {
  async login(email: string, password: string): Promise<TokenPair> {
    const user = await AuthRepository.findUserByEmail(email);
    if (!user || user.status !== 'ACTIVE') throw new UnauthorizedError('Invalid credentials');
    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) throw new UnauthorizedError('Invalid credentials');
    return issueTokens(user);
  },

  async refresh(refreshToken: string): Promise<TokenPair> {
    const tokenHash = hashRefreshToken(refreshToken);
    const stored = await AuthRepository.findActiveRefreshToken(tokenHash);
    if (!stored) throw new UnauthorizedError('Invalid refresh token');
    await AuthRepository.revokeRefreshToken(tokenHash);
    return issueTokens(stored.user);
  },

  async logout(refreshToken: string): Promise<void> {
    await AuthRepository.revokeRefreshToken(hashRefreshToken(refreshToken));
  },
};
```

- [ ] **Step 6: Run to verify pass**

Run: `npm run test -w @ventry/api -- auth.service.test`
Expected: PASS (5 tests).

- [ ] **Step 7: Write failing route test**

`apps/api/src/modules/auth/auth.routes.test.ts`:
```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { hashPassword } from '../../lib/password.js';

describe('POST /auth/login', () => {
  let tenantId: string;
  const app = createApp();

  beforeAll(async () => {
    const tenant = await prisma.tenant.create({ data: { name: 'Route Test Tenant' } });
    tenantId = tenant.id;
  });

  afterAll(async () => {
    await prisma.refreshToken.deleteMany({ where: { user: { tenantId } } });
    await prisma.user.deleteMany({ where: { tenantId } });
    await prisma.tenant.delete({ where: { id: tenantId } });
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.refreshToken.deleteMany({ where: { user: { tenantId } } });
    await prisma.user.deleteMany({ where: { tenantId } });
    await prisma.user.create({
      data: {
        tenantId,
        email: 'route@test.com',
        passwordHash: await hashPassword('secret123'),
        firstName: 'Route',
        lastName: 'Test',
        role: 'ADMIN',
      },
    });
  });

  it('returns 200 and sets a refresh cookie on valid credentials', async () => {
    const res = await request(app).post('/auth/login').send({ email: 'route@test.com', password: 'secret123' });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTypeOf('string');
    expect(res.headers['set-cookie']?.[0]).toMatch(/refreshToken=/);
  });

  it('returns 401 on invalid credentials', async () => {
    const res = await request(app).post('/auth/login').send({ email: 'route@test.com', password: 'wrong' });
    expect(res.status).toBe(401);
  });

  it('returns 400 on malformed body', async () => {
    const res = await request(app).post('/auth/login').send({ email: 'not-an-email' });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 8: Run to verify failure**

Run: `npm run test -w @ventry/api -- auth.routes.test`
Expected: FAIL (no `/auth/login` route registered → 404).

- [ ] **Step 9: Implement auth routes**

`apps/api/src/modules/auth/auth.routes.ts`:
```typescript
import { Router } from 'express';
import { z } from 'zod';
import { AuthService } from './auth.service.js';
import { ValidationError } from '../../lib/errors.js';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const REFRESH_COOKIE = 'refreshToken';
const REFRESH_COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  maxAge: 30 * 24 * 60 * 60 * 1000,
};

export const authRouter = Router();

authRouter.post('/login', async (req, res, next) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError('Invalid email or password format');
    const { accessToken, refreshToken } = await AuthService.login(parsed.data.email, parsed.data.password);
    res.cookie(REFRESH_COOKIE, refreshToken, REFRESH_COOKIE_OPTS);
    res.json({ accessToken });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/refresh', async (req, res, next) => {
  try {
    const token = req.cookies?.[REFRESH_COOKIE];
    if (!token) throw new ValidationError('Missing refresh token');
    const { accessToken, refreshToken } = await AuthService.refresh(token);
    res.cookie(REFRESH_COOKIE, refreshToken, REFRESH_COOKIE_OPTS);
    res.json({ accessToken });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/logout', async (req, res, next) => {
  try {
    const token = req.cookies?.[REFRESH_COOKIE];
    if (token) await AuthService.logout(token);
    res.clearCookie(REFRESH_COOKIE);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});
```

- [ ] **Step 10: Wire cookies, routes and error middleware into the app**

Add `cookie-parser` to `apps/api/package.json` dependencies (`"cookie-parser": "^1.4.6"`, `"@types/cookie-parser": "^1.4.7"` in devDependencies), then run `npm install`.

Modify `apps/api/src/app.ts`:
```typescript
import express, { type Express, type ErrorRequestHandler } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { authRouter } from './modules/auth/auth.routes.js';
import { AppError } from './lib/errors.js';

export function createApp(): Express {
  const app = express();
  app.use(cors({ origin: process.env.WEB_ORIGIN ?? 'http://localhost:5173', credentials: true }));
  app.use(express.json());
  app.use(cookieParser());

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/auth', authRouter);

  const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
    if (err instanceof AppError) {
      res.status(err.statusCode).json({ error: err.message });
      return;
    }
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  };
  app.use(errorHandler);

  return app;
}
```

- [ ] **Step 11: Run to verify pass**

Run: `npm run test -w @ventry/api`
Expected: PASS (all tests, including the 3 new route tests).

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "feat: add auth module (login, refresh, logout) with cookie-based refresh tokens"
```

---

## Task 5: requireAuth / requireRole middleware

**Files:**
- Create: `apps/api/src/middleware/auth.ts`
- Test: `apps/api/src/middleware/auth.test.ts`

**Interfaces:**
- Consumes: `verifyAccessToken` from `../lib/tokens.js`; `UnauthorizedError`, `ForbiddenError` from `../lib/errors.js`.
- Produces: `requireAuth: RequestHandler` (sets `req.user = { userId, tenantId, role }`), `requireRole(...roles: ('ADMIN' | 'VENDEDOR')[]): RequestHandler`.
- Modifies the Express `Request` type to include `user?: { userId: string; tenantId: string; role: 'ADMIN' | 'VENDEDOR' }`.

- [ ] **Step 1: Write failing middleware tests**

`apps/api/src/middleware/auth.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { signAccessToken } from '../lib/tokens.js';
import { requireAuth, requireRole } from './auth.js';

function buildTestApp() {
  const app = express();
  app.get('/whoami', requireAuth, (req, res) => res.json(req.user));
  app.get('/admin-only', requireAuth, requireRole('ADMIN'), (_req, res) => res.json({ ok: true }));
  app.use((err: any, _req: any, res: any, _next: any) => {
    res.status(err.statusCode ?? 500).json({ error: err.message });
  });
  return app;
}

describe('requireAuth', () => {
  const app = buildTestApp();

  it('rejects requests with no Authorization header', async () => {
    const res = await request(app).get('/whoami');
    expect(res.status).toBe(401);
  });

  it('rejects an invalid token', async () => {
    const res = await request(app).get('/whoami').set('Authorization', 'Bearer garbage');
    expect(res.status).toBe(401);
  });

  it('attaches req.user for a valid token', async () => {
    process.env.JWT_ACCESS_SECRET = 'test-access-secret';
    const token = signAccessToken({ userId: 'u1', tenantId: 't1', role: 'VENDEDOR' });
    const res = await request(app).get('/whoami').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ userId: 'u1', tenantId: 't1', role: 'VENDEDOR' });
  });
});

describe('requireRole', () => {
  const app = buildTestApp();

  it('rejects a VENDEDOR from an ADMIN-only route', async () => {
    process.env.JWT_ACCESS_SECRET = 'test-access-secret';
    const token = signAccessToken({ userId: 'u1', tenantId: 't1', role: 'VENDEDOR' });
    const res = await request(app).get('/admin-only').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('allows an ADMIN through', async () => {
    process.env.JWT_ACCESS_SECRET = 'test-access-secret';
    const token = signAccessToken({ userId: 'u1', tenantId: 't1', role: 'ADMIN' });
    const res = await request(app).get('/admin-only').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm run test -w @ventry/api -- middleware/auth.test`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the middleware**

`apps/api/src/middleware/auth.ts`:
```typescript
import type { RequestHandler } from 'express';
import { verifyAccessToken, type AccessTokenPayload } from '../lib/tokens.js';
import { UnauthorizedError, ForbiddenError } from '../lib/errors.js';

declare global {
  namespace Express {
    interface Request {
      user?: AccessTokenPayload;
    }
  }
}

export const requireAuth: RequestHandler = (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    next(new UnauthorizedError('Missing bearer token'));
    return;
  }
  try {
    req.user = verifyAccessToken(header.slice('Bearer '.length));
    next();
  } catch {
    next(new UnauthorizedError('Invalid or expired token'));
  }
};

export function requireRole(...roles: AccessTokenPayload['role'][]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      next(new ForbiddenError('Insufficient role'));
      return;
    }
    next();
  };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm run test -w @ventry/api -- middleware/auth.test`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add requireAuth/requireRole middleware"
```

---

## Task 6: Tenant + admin seed script

**Files:**
- Create: `apps/api/prisma/seed.ts`
- Modify: `apps/api/package.json` (add `prisma.seed` config and `db:seed` script)
- Test: `apps/api/prisma/seed.test.ts`

**Interfaces:**
- Consumes: `prisma` from `../src/lib/prisma.js`, `hashPassword` from `../src/lib/password.js`.
- Produces: `seed(env: { tenantName: string; adminEmail: string; adminPassword: string }): Promise<{ tenantId: string; userId: string }>`, idempotent (safe to run twice).

- [ ] **Step 1: Write failing seed test**

`apps/api/prisma/seed.test.ts`:
```typescript
import { describe, it, expect, afterAll } from 'vitest';
import { prisma } from '../src/lib/prisma.js';
import { seed } from './seed.js';

describe('seed', () => {
  const env = { tenantName: 'Seed Test Co', adminEmail: 'seed-admin@test.com', adminPassword: 'secret123' };

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: env.adminEmail } });
    await prisma.tenant.deleteMany({ where: { name: env.tenantName } });
    await prisma.$disconnect();
  });

  it('creates a tenant and an ADMIN user', async () => {
    const result = await seed(env);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: result.userId } });
    expect(user.role).toBe('ADMIN');
    expect(user.tenantId).toBe(result.tenantId);
  });

  it('is idempotent: running twice does not duplicate the admin user', async () => {
    await seed(env);
    await seed(env);
    const count = await prisma.user.count({ where: { email: env.adminEmail } });
    expect(count).toBe(1);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm run test -w @ventry/api -- prisma/seed.test`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the seed script**

`apps/api/prisma/seed.ts`:
```typescript
import { prisma } from '../src/lib/prisma.js';
import { hashPassword } from '../src/lib/password.js';

interface SeedEnv {
  tenantName: string;
  adminEmail: string;
  adminPassword: string;
}

export async function seed(env: SeedEnv): Promise<{ tenantId: string; userId: string }> {
  const existing = await prisma.user.findUnique({ where: { email: env.adminEmail } });
  if (existing) {
    return { tenantId: existing.tenantId, userId: existing.id };
  }

  const tenant = await prisma.tenant.upsert({
    where: { id: (await prisma.tenant.findFirst({ where: { name: env.tenantName } }))?.id ?? '00000000-0000-0000-0000-000000000000' },
    update: {},
    create: { name: env.tenantName },
  });

  const user = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      email: env.adminEmail,
      passwordHash: await hashPassword(env.adminPassword),
      firstName: 'Admin',
      lastName: env.tenantName,
      role: 'ADMIN',
    },
  });

  return { tenantId: tenant.id, userId: user.id };
}

async function main() {
  const tenantName = process.env.ADMIN_TENANT_NAME;
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!tenantName || !adminEmail || !adminPassword) {
    throw new Error('ADMIN_TENANT_NAME, ADMIN_EMAIL and ADMIN_PASSWORD must be set');
  }
  const result = await seed({ tenantName, adminEmail, adminPassword });
  console.log(`Seeded tenant ${result.tenantId} with admin user ${result.userId}`);
}

if (process.argv[1]?.endsWith('seed.ts') || process.argv[1]?.endsWith('seed.js')) {
  main().finally(() => prisma.$disconnect());
}
```

- [ ] **Step 4: Add the `db:seed` script**

Modify `apps/api/package.json` scripts:
```json
"db:seed": "tsx prisma/seed.ts"
```

- [ ] **Step 5: Run to verify pass**

Run: `npm run test -w @ventry/api -- prisma/seed.test`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add idempotent tenant/admin seed script"
```

---

## Task 7: Users / Vendedores module (backend)

**Files:**
- Create: `apps/api/src/modules/users/users.repository.ts`
- Create: `apps/api/src/modules/users/users.service.ts`
- Create: `apps/api/src/modules/users/users.routes.ts`
- Create: `packages/shared/src/users.ts`
- Modify: `packages/shared/src/index.ts` (re-export `users.ts`)
- Modify: `apps/api/src/app.ts` (mount `/users` behind `requireAuth`)
- Test: `apps/api/src/modules/users/users.service.test.ts`
- Test: `apps/api/src/modules/users/users.routes.test.ts`

**Interfaces:**
- Consumes: `requireAuth`, `requireRole` from `../../middleware/auth.js`; `prisma` from `../../lib/prisma.js`; `hashPassword` from `../../lib/password.js`; `NotFoundError`, `ForbiddenError` from `../../lib/errors.js`.
- Produces (shared, `packages/shared/src/users.ts`): `createUserSchema` (Zod), `updateUserSchema` (Zod), `UserDTO` type `{ id, email, firstName, lastName, role, status, phone, commissionPct, hireDate }`.
- Produces (`UsersService`): `list(tenantId): Promise<UserDTO[]>`, `create(tenantId, input): Promise<UserDTO>`, `update(tenantId, id, input): Promise<UserDTO>`, `setStatus(tenantId, id, status): Promise<UserDTO>`.

- [ ] **Step 1: Shared Zod schemas**

`packages/shared/src/users.ts`:
```typescript
import { z } from 'zod';

export const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  role: z.enum(['ADMIN', 'VENDEDOR']),
  phone: z.string().optional(),
  commissionPct: z.number().min(0).max(100).optional(),
});

export const updateUserSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  phone: z.string().optional(),
  commissionPct: z.number().min(0).max(100).optional(),
});

export const setUserStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'INACTIVE']),
});

export interface UserDTO {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'ADMIN' | 'VENDEDOR';
  status: 'ACTIVE' | 'INACTIVE';
  phone: string | null;
  commissionPct: number;
  hireDate: string;
}
```

Modify `packages/shared/src/index.ts`:
```typescript
export * from './users.js';
```

- [ ] **Step 2: Write failing service tests**

`apps/api/src/modules/users/users.service.test.ts`:
```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { prisma } from '../../lib/prisma.js';
import { UsersService } from './users.service.js';
import { NotFoundError } from '../../lib/errors.js';

describe('UsersService', () => {
  let tenantId: string;
  let otherTenantId: string;

  beforeAll(async () => {
    tenantId = (await prisma.tenant.create({ data: { name: 'Users Test Tenant' } })).id;
    otherTenantId = (await prisma.tenant.create({ data: { name: 'Other Tenant' } })).id;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { tenantId: { in: [tenantId, otherTenantId] } } });
    await prisma.tenant.deleteMany({ where: { id: { in: [tenantId, otherTenantId] } } });
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.user.deleteMany({ where: { tenantId: { in: [tenantId, otherTenantId] } } });
  });

  it('creates a VENDEDOR with default 20% commission', async () => {
    const user = await UsersService.create(tenantId, {
      email: 'juan@test.com',
      password: 'secret123',
      firstName: 'Juan',
      lastName: 'Perez',
      role: 'VENDEDOR',
    });
    expect(user.commissionPct).toBe(20);
    expect(user.status).toBe('ACTIVE');
  });

  it('lists only users from the given tenant', async () => {
    await UsersService.create(tenantId, { email: 'a@test.com', password: 'secret123', firstName: 'A', lastName: 'A', role: 'VENDEDOR' });
    await UsersService.create(otherTenantId, { email: 'b@test.com', password: 'secret123', firstName: 'B', lastName: 'B', role: 'VENDEDOR' });
    const list = await UsersService.list(tenantId);
    expect(list).toHaveLength(1);
    expect(list[0].email).toBe('a@test.com');
  });

  it('setStatus deactivates a user without deleting it', async () => {
    const user = await UsersService.create(tenantId, { email: 'c@test.com', password: 'secret123', firstName: 'C', lastName: 'C', role: 'VENDEDOR' });
    const updated = await UsersService.setStatus(tenantId, user.id, 'INACTIVE');
    expect(updated.status).toBe('INACTIVE');
    const stillThere = await UsersService.list(tenantId);
    expect(stillThere.find((u) => u.id === user.id)).toBeDefined();
  });

  it('throws NotFoundError when updating a user from another tenant', async () => {
    const user = await UsersService.create(otherTenantId, { email: 'd@test.com', password: 'secret123', firstName: 'D', lastName: 'D', role: 'VENDEDOR' });
    await expect(UsersService.setStatus(tenantId, user.id, 'INACTIVE')).rejects.toThrow(NotFoundError);
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npm run test -w @ventry/api -- users.service.test`
Expected: FAIL (module not found).

- [ ] **Step 4: Implement the repository**

`apps/api/src/modules/users/users.repository.ts`:
```typescript
import { prisma } from '../../lib/prisma.js';
import type { Prisma, UserRole, UserStatus } from '@prisma/client';

export const UsersRepository = {
  findManyByTenant(tenantId: string) {
    return prisma.user.findMany({ where: { tenantId }, orderBy: { createdAt: 'asc' } });
  },

  findByIdAndTenant(id: string, tenantId: string) {
    return prisma.user.findFirst({ where: { id, tenantId } });
  },

  create(data: Prisma.UserUncheckedCreateInput) {
    return prisma.user.create({ data });
  },

  updateByIdAndTenant(id: string, tenantId: string, data: Prisma.UserUpdateInput) {
    return prisma.user.updateMany({ where: { id, tenantId }, data });
  },

  updateStatus(id: string, tenantId: string, status: UserStatus) {
    return prisma.user.updateMany({ where: { id, tenantId }, data: { status } });
  },
};
```

- [ ] **Step 5: Implement the service**

`apps/api/src/modules/users/users.service.ts`:
```typescript
import type { UserDTO, createUserSchema, updateUserSchema } from '@ventry/shared';
import type { z } from 'zod';
import { UsersRepository } from './users.repository.js';
import { hashPassword } from '../../lib/password.js';
import { NotFoundError } from '../../lib/errors.js';
import type { User } from '@prisma/client';

function toDTO(user: User): UserDTO {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    status: user.status,
    phone: user.phone,
    commissionPct: Number(user.commissionPct),
    hireDate: user.hireDate.toISOString(),
  };
}

export const UsersService = {
  async list(tenantId: string): Promise<UserDTO[]> {
    const users = await UsersRepository.findManyByTenant(tenantId);
    return users.map(toDTO);
  },

  async create(tenantId: string, input: z.infer<typeof createUserSchema>): Promise<UserDTO> {
    const user = await UsersRepository.create({
      tenantId,
      email: input.email,
      passwordHash: await hashPassword(input.password),
      firstName: input.firstName,
      lastName: input.lastName,
      role: input.role,
      phone: input.phone,
      commissionPct: input.commissionPct ?? 20,
    });
    return toDTO(user);
  },

  async update(tenantId: string, id: string, input: z.infer<typeof updateUserSchema>): Promise<UserDTO> {
    const existing = await UsersRepository.findByIdAndTenant(id, tenantId);
    if (!existing) throw new NotFoundError('User not found');
    await UsersRepository.updateByIdAndTenant(id, tenantId, input);
    const updated = await UsersRepository.findByIdAndTenant(id, tenantId);
    return toDTO(updated!);
  },

  async setStatus(tenantId: string, id: string, status: 'ACTIVE' | 'INACTIVE'): Promise<UserDTO> {
    const existing = await UsersRepository.findByIdAndTenant(id, tenantId);
    if (!existing) throw new NotFoundError('User not found');
    await UsersRepository.updateStatus(id, tenantId, status);
    const updated = await UsersRepository.findByIdAndTenant(id, tenantId);
    return toDTO(updated!);
  },
};
```

- [ ] **Step 6: Run to verify pass**

Run: `npm run test -w @ventry/api -- users.service.test`
Expected: PASS (4 tests).

- [ ] **Step 7: Write failing route tests**

`apps/api/src/modules/users/users.routes.test.ts`:
```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { signAccessToken } from '../../lib/tokens.js';

describe('/users routes', () => {
  const app = createApp();
  let tenantId: string;
  let adminToken: string;
  let vendedorToken: string;

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? 'test-access-secret';
    tenantId = (await prisma.tenant.create({ data: { name: 'Users Route Tenant' } })).id;
    adminToken = signAccessToken({ userId: 'admin-1', tenantId, role: 'ADMIN' });
    vendedorToken = signAccessToken({ userId: 'vendedor-1', tenantId, role: 'VENDEDOR' });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { tenantId } });
    await prisma.tenant.delete({ where: { id: tenantId } });
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.user.deleteMany({ where: { tenantId } });
  });

  it('rejects unauthenticated requests', async () => {
    const res = await request(app).get('/users');
    expect(res.status).toBe(401);
  });

  it('lets an ADMIN create a vendedor', async () => {
    const res = await request(app)
      .post('/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: 'new@test.com', password: 'secret123', firstName: 'New', lastName: 'Guy', role: 'VENDEDOR' });
    expect(res.status).toBe(201);
    expect(res.body.commissionPct).toBe(20);
  });

  it('rejects a VENDEDOR trying to create a user', async () => {
    const res = await request(app)
      .post('/users')
      .set('Authorization', `Bearer ${vendedorToken}`)
      .send({ email: 'new2@test.com', password: 'secret123', firstName: 'New', lastName: 'Guy', role: 'VENDEDOR' });
    expect(res.status).toBe(403);
  });

  it('lists users for the authenticated tenant', async () => {
    await request(app)
      .post('/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: 'list@test.com', password: 'secret123', firstName: 'List', lastName: 'Me', role: 'VENDEDOR' });
    const res = await request(app).get('/users').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });
});
```

- [ ] **Step 8: Run to verify failure**

Run: `npm run test -w @ventry/api -- users.routes.test`
Expected: FAIL (404, no `/users` route).

- [ ] **Step 9: Implement the routes**

`apps/api/src/modules/users/users.routes.ts`:
```typescript
import { Router } from 'express';
import { createUserSchema, updateUserSchema, setUserStatusSchema } from '@ventry/shared';
import { UsersService } from './users.service.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { ValidationError } from '../../lib/errors.js';

export const usersRouter = Router();

usersRouter.use(requireAuth);

usersRouter.get('/', async (req, res, next) => {
  try {
    const users = await UsersService.list(req.user!.tenantId);
    res.json(users);
  } catch (err) {
    next(err);
  }
});

usersRouter.post('/', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const parsed = createUserSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.message);
    const user = await UsersService.create(req.user!.tenantId, parsed.data);
    res.status(201).json(user);
  } catch (err) {
    next(err);
  }
});

usersRouter.patch('/:id', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const parsed = updateUserSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.message);
    const user = await UsersService.update(req.user!.tenantId, req.params.id, parsed.data);
    res.json(user);
  } catch (err) {
    next(err);
  }
});

usersRouter.patch('/:id/status', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const parsed = setUserStatusSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.message);
    const user = await UsersService.setStatus(req.user!.tenantId, req.params.id, parsed.data.status);
    res.json(user);
  } catch (err) {
    next(err);
  }
});
```

Modify `apps/api/src/app.ts` to mount it (add import and `app.use('/users', usersRouter);` after the auth router line).

- [ ] **Step 10: Run to verify pass**

Run: `npm run test -w @ventry/api`
Expected: PASS (all tests).

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat: add users/vendedores module (list, create, update, activate/deactivate)"
```

---

## Task 8: Frontend scaffold — design system, layout, routing

**Files:**
- Modify: `apps/web/package.json` (add dependencies)
- Create: `apps/web/tailwind.config.ts`, `apps/web/postcss.config.js`
- Create: `apps/web/src/index.css`
- Create: `apps/web/src/lib/api.ts`
- Create: `apps/web/src/lib/cn.ts`
- Create: `apps/web/src/components/ui/button.tsx`, `apps/web/src/components/ui/card.tsx`, `apps/web/src/components/ui/badge.tsx`
- Create: `apps/web/src/components/layout/AppShell.tsx`
- Create: `apps/web/src/routes/router.tsx`
- Modify: `apps/web/src/main.tsx`
- Test: `apps/web/src/lib/cn.test.ts`

**Interfaces:**
- Produces: `cn(...classes: (string | false | undefined)[]): string`.
- Produces: `apiClient` (axios instance) from `apps/web/src/lib/api.ts` with `baseURL = import.meta.env.VITE_API_URL`, an interceptor that retries once on 401 via `POST /auth/refresh`.
- Produces: `<AppShell>` layout component rendering the sidebar (Dashboard, Leads, Deals, Empresas, Contactos, Vendedores, Actividades, Tareas, Configuración) + topbar, wrapping `<Outlet />`.

- [ ] **Step 1: Add frontend dependencies**

Modify `apps/web/package.json` dependencies:
```json
{
  "@radix-ui/react-dialog": "^1.1.2",
  "@radix-ui/react-slot": "^1.1.0",
  "@tanstack/react-query": "^5.56.2",
  "@tanstack/react-table": "^8.20.5",
  "axios": "^1.7.7",
  "class-variance-authority": "^0.7.0",
  "clsx": "^2.1.1",
  "lucide-react": "^0.441.0",
  "react-hook-form": "^7.53.0",
  "react-router-dom": "^6.26.2",
  "tailwind-merge": "^2.5.2",
  "zod": "^3.23.8",
  "@hookform/resolvers": "^3.9.0",
  "@ventry/shared": "*"
},
"devDependencies": {
  "autoprefixer": "^10.4.20",
  "postcss": "^8.4.47",
  "tailwindcss": "^3.4.11",
  "vitest": "^2.0.5"
}
```

Run: `npm install`

- [ ] **Step 2: Tailwind config with design tokens**

`apps/web/tailwind.config.ts`:
```typescript
import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] },
      colors: {
        surface: '#F7F7F8',
      },
    },
  },
  plugins: [],
} satisfies Config;
```

`apps/web/postcss.config.js`:
```javascript
export default {
  plugins: { tailwindcss: {}, autoprefixer: {} },
};
```

`apps/web/src/index.css`:
```css
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  @apply bg-surface text-gray-900 font-sans antialiased;
}
```

- [ ] **Step 3: `cn` helper with a test**

`apps/web/src/lib/cn.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { cn } from './cn.js';

describe('cn', () => {
  it('joins truthy class names and drops falsy ones', () => {
    expect(cn('a', false, undefined, 'b')).toBe('a b');
  });

  it('merges conflicting tailwind classes, keeping the last', () => {
    expect(cn('p-2', 'p-4')).toBe('p-4');
  });
});
```

`apps/web/src/lib/cn.ts`:
```typescript
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
```

Run: `npm run test -w @ventry/web -- cn.test`
Expected: PASS (2 tests).

- [ ] **Step 4: Base UI primitives**

`apps/web/src/components/ui/button.tsx`:
```tsx
import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/cn.js';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none',
  {
    variants: {
      variant: {
        primary: 'bg-gray-900 text-white hover:bg-gray-800',
        outline: 'border border-gray-200 bg-white text-gray-900 hover:bg-gray-50',
        ghost: 'text-gray-600 hover:bg-gray-100',
      },
      size: {
        sm: 'h-8 px-3',
        md: 'h-10 px-4',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  }
);

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, ...props }, ref) => (
  <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
));
Button.displayName = 'Button';
```

`apps/web/src/components/ui/card.tsx`:
```tsx
import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/cn.js';

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-xl border border-gray-200 bg-white shadow-sm', className)} {...props} />;
}
```

`apps/web/src/components/ui/badge.tsx`:
```tsx
import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/cn.js';

const toneClasses = {
  neutral: 'bg-gray-100 text-gray-700',
  success: 'bg-emerald-100 text-emerald-700',
  warning: 'bg-amber-100 text-amber-700',
  danger: 'bg-red-100 text-red-700',
  info: 'bg-blue-100 text-blue-700',
} as const;

export function Badge({ tone = 'neutral', className, ...props }: HTMLAttributes<HTMLSpanElement> & { tone?: keyof typeof toneClasses }) {
  return <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', toneClasses[tone], className)} {...props} />;
}
```

- [ ] **Step 5: API client with refresh-on-401**

`apps/web/src/lib/api.ts`:
```typescript
import axios from 'axios';

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  withCredentials: true,
});

let accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

apiClient.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  return config;
});

let refreshPromise: Promise<string> | null = null;

async function refreshAccessToken(): Promise<string> {
  const res = await axios.post(`${import.meta.env.VITE_API_URL}/auth/refresh`, {}, { withCredentials: true });
  setAccessToken(res.data.accessToken);
  return res.data.accessToken;
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      refreshPromise ??= refreshAccessToken().finally(() => {
        refreshPromise = null;
      });
      const newToken = await refreshPromise;
      original.headers.Authorization = `Bearer ${newToken}`;
      return apiClient(original);
    }
    return Promise.reject(error);
  }
);
```

- [ ] **Step 6: App shell layout**

`apps/web/src/components/layout/AppShell.tsx`:
```tsx
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
```

- [ ] **Step 7: Router and app entry**

`apps/web/src/routes/router.tsx`:
```tsx
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
```

Modify `apps/web/src/main.tsx`:
```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { router } from './routes/router.js';
import './index.css';

const queryClient = new QueryClient();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>
);
```

- [ ] **Step 8: Run the frontend test and typecheck**

Run: `npm run test -w @ventry/web`
Expected: PASS (2 tests from `cn.test.ts`; `LoginPage`/`TeamPage` imports are satisfied by Tasks 9-10 below, so run this step again after those exist if it fails to build here).

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: add frontend design system primitives, API client, and app shell"
```

---

## Task 9: Login page

**Files:**
- Create: `apps/web/src/pages/LoginPage.tsx`
- Create: `apps/web/src/hooks/useAuth.ts`
- Test: `apps/web/src/hooks/useAuth.test.tsx`

**Interfaces:**
- Consumes: `apiClient`, `setAccessToken` from `../lib/api.js`.
- Produces: `useLogin(): { mutate: (input: { email: string; password: string }) => void; isPending: boolean; error: Error | null }` (wraps a TanStack Query mutation calling `POST /auth/login`, storing the access token, then navigating to `/`).

- [ ] **Step 1: Write failing hook test**

`apps/web/src/hooks/useAuth.test.tsx`:
```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { apiClient, setAccessToken } from '../lib/api.js';
import { useLogin } from './useAuth.js';

vi.mock('../lib/api.js', async () => {
  const actual = await vi.importActual<typeof import('../lib/api.js')>('../lib/api.js');
  return { ...actual, setAccessToken: vi.fn() };
});

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient();
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useLogin', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('stores the access token on success', async () => {
    vi.spyOn(apiClient, 'post').mockResolvedValue({ data: { accessToken: 'abc123' } });
    const { result } = renderHook(() => useLogin(), { wrapper });
    result.current.mutate({ email: 'a@test.com', password: 'secret123' });
    await waitFor(() => expect(setAccessToken).toHaveBeenCalledWith('abc123'));
  });
});
```

Add devDependencies to `apps/web/package.json`: `"@testing-library/react": "^16.0.1"`, `"jsdom": "^25.0.0"`. Add to `apps/web/vite.config.ts` a `test: { environment: 'jsdom' }` block.

- [ ] **Step 2: Run to verify failure**

Run: `npm run test -w @ventry/web -- useAuth.test`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement useAuth**

`apps/web/src/hooks/useAuth.ts`:
```typescript
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { apiClient, setAccessToken } from '../lib/api.js';

interface LoginInput {
  email: string;
  password: string;
}

export function useLogin() {
  const navigate = useNavigate();
  return useMutation({
    mutationFn: async (input: LoginInput) => {
      const res = await apiClient.post<{ accessToken: string }>('/auth/login', input);
      return res.data;
    },
    onSuccess: (data) => {
      setAccessToken(data.accessToken);
      navigate('/');
    },
  });
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm run test -w @ventry/web -- useAuth.test`
Expected: PASS (1 test).

- [ ] **Step 5: Build the login page**

`apps/web/src/pages/LoginPage.tsx`:
```tsx
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
  const { register, handleSubmit, formState: { errors } } = useForm<LoginForm>({ resolver: zodResolver(loginSchema) });
  const login = useLogin();

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface">
      <Card className="w-full max-w-sm p-8">
        <h1 className="mb-6 text-xl font-semibold">Ingresar a VentryCRM</h1>
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
        </form>
      </Card>
    </div>
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add login page wired to /auth/login"
```

---

## Task 10: Vendedores (Team) page

**Files:**
- Create: `apps/web/src/pages/TeamPage.tsx`
- Create: `apps/web/src/hooks/useUsers.ts`
- Create: `apps/web/src/components/team/CreateVendedorDialog.tsx`
- Test: `apps/web/src/hooks/useUsers.test.tsx`

**Interfaces:**
- Consumes: `apiClient` from `../lib/api.js`; `UserDTO`, `createUserSchema` from `@ventry/shared`.
- Produces: `useUsers(): UseQueryResult<UserDTO[]>`, `useCreateUser(): UseMutationResult<UserDTO, Error, CreateUserInput>`, `useSetUserStatus(): UseMutationResult<UserDTO, Error, { id: string; status: 'ACTIVE' | 'INACTIVE' }>`.

- [ ] **Step 1: Write failing hook test**

`apps/web/src/hooks/useUsers.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { apiClient } from '../lib/api.js';
import { useUsers } from './useUsers.js';

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient();
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useUsers', () => {
  it('fetches the user list', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({ data: [{ id: '1', email: 'a@test.com' }] });
    const { result } = renderHook(() => useUsers(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm run test -w @ventry/web -- useUsers.test`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement useUsers hooks**

`apps/web/src/hooks/useUsers.ts`:
```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { UserDTO } from '@ventry/shared';
import { apiClient } from '../lib/api.js';

const USERS_KEY = ['users'];

export function useUsers() {
  return useQuery({
    queryKey: USERS_KEY,
    queryFn: async () => (await apiClient.get<UserDTO[]>('/users')).data,
  });
}

export interface CreateUserInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: 'ADMIN' | 'VENDEDOR';
  phone?: string;
  commissionPct?: number;
}

export function useCreateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateUserInput) => (await apiClient.post<UserDTO>('/users', input)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: USERS_KEY }),
  });
}

export function useSetUserStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: 'ACTIVE' | 'INACTIVE' }) =>
      (await apiClient.patch<UserDTO>(`/users/${id}/status`, { status })).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: USERS_KEY }),
  });
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm run test -w @ventry/web -- useUsers.test`
Expected: PASS (1 test).

- [ ] **Step 5: Create-vendedor dialog**

`apps/web/src/components/team/CreateVendedorDialog.tsx`:
```tsx
import * as Dialog from '@radix-ui/react-dialog';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createUserSchema } from '@ventry/shared';
import { z } from 'zod';
import { Button } from '../ui/button.js';
import { useCreateUser } from '../../hooks/useUsers.js';

const formSchema = createUserSchema.omit({ role: true });
type FormValues = z.infer<typeof formSchema>;

export function CreateVendedorDialog() {
  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormValues>({ resolver: zodResolver(formSchema) });
  const createUser = useCreateUser();

  const onSubmit = (data: FormValues) => {
    createUser.mutate({ ...data, role: 'VENDEDOR' }, { onSuccess: () => reset() });
  };

  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <Button>Agregar vendedor</Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/30" />
        <Dialog.Content className="fixed left-1/2 top-1/2 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-6 shadow-lg">
          <Dialog.Title className="mb-4 text-lg font-semibold">Nuevo vendedor</Dialog.Title>
          <form className="space-y-3" onSubmit={handleSubmit(onSubmit)}>
            <input className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" placeholder="Nombre" {...register('firstName')} />
            <input className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" placeholder="Apellido" {...register('lastName')} />
            <input className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" placeholder="Correo" type="email" {...register('email')} />
            <input className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" placeholder="Contraseña temporal" type="password" {...register('password')} />
            <input className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" placeholder="Teléfono (opcional)" {...register('phone')} />
            {Object.values(errors).map((err, i) => (
              <p key={i} className="text-xs text-red-600">{err?.message as string}</p>
            ))}
            <Button type="submit" className="w-full" disabled={createUser.isPending}>
              {createUser.isPending ? 'Creando…' : 'Crear vendedor'}
            </Button>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
```

- [ ] **Step 6: Team page with table**

`apps/web/src/pages/TeamPage.tsx`:
```tsx
import { useReactTable, getCoreRowModel, flexRender, createColumnHelper } from '@tanstack/react-table';
import type { UserDTO } from '@ventry/shared';
import { Card } from '../components/ui/card.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { CreateVendedorDialog } from '../components/team/CreateVendedorDialog.js';
import { useUsers, useSetUserStatus } from '../hooks/useUsers.js';

const columnHelper = createColumnHelper<UserDTO>();

export function TeamPage() {
  const { data: users, isLoading } = useUsers();
  const setStatus = useSetUserStatus();

  const columns = [
    columnHelper.accessor((row) => `${row.firstName} ${row.lastName}`, {
      id: 'name',
      header: 'Vendedor',
    }),
    columnHelper.accessor('email', { header: 'Correo' }),
    columnHelper.accessor('status', {
      header: 'Estado',
      cell: (info) => <Badge tone={info.getValue() === 'ACTIVE' ? 'success' : 'neutral'}>{info.getValue() === 'ACTIVE' ? 'Activo' : 'Inactivo'}</Badge>,
    }),
    columnHelper.accessor('commissionPct', {
      header: 'Comisión',
      cell: (info) => `${info.getValue()}%`,
    }),
    columnHelper.display({
      id: 'actions',
      header: 'Acciones',
      cell: ({ row }) => (
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            setStatus.mutate({ id: row.original.id, status: row.original.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' })
          }
        >
          {row.original.status === 'ACTIVE' ? 'Desactivar' : 'Activar'}
        </Button>
      ),
    }),
  ];

  const table = useReactTable({ data: users ?? [], columns, getCoreRowModel: getCoreRowModel() });

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Vendedores</h1>
        <CreateVendedorDialog />
      </div>
      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="p-6 text-sm text-gray-500">Cargando…</div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-200 bg-gray-50">
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <th key={header.id} className="px-4 py-3 font-medium text-gray-600">
                      {flexRender(header.column.columnDef.header, header.getContext())}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((row) => (
                <tr key={row.id} className="border-b border-gray-100 last:border-0">
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-4 py-3">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
```

- [ ] **Step 7: Run full frontend test suite**

Run: `npm run test -w @ventry/web`
Expected: PASS (all tests).

- [ ] **Step 8: Manual smoke test**

Run: `npm run dev:api` (in one terminal) and `npm run dev:web` (in another), then `npm run db:seed -w @ventry/api` with `.env` pointed at a real dev database. Open `http://localhost:5173/login`, log in with the seeded admin credentials, navigate to `/team`, create a vendedor, and toggle its status. Confirm the table updates without a page reload.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: add vendedores (team) page with create and activate/deactivate"
```

---

## Plan Self-Review Notes

- **Spec coverage:** monorepo/shared package (§A), Tenant/User/RefreshToken/AuditLog schema + app-layer tenant scoping (§B), JWT login/refresh/logout with rotation, no public signup (§C), layered routes→service→repository with Zod validation (§D), Tailwind/shadcn-style design tokens matching the reference images (§E), Postgres-in-Docker for tests only + Dockerfile deferred to deployment task (§F). `AuditLog` model is created here but write-side wiring (recording create/update events) is deferred to the next plan alongside the entities it will actually audit (Leads, Companies, Deals) — tracked as a gap for **Plan 2**, not silently dropped.
- **Deferred to Plan 2 (Leads, Empresas, Contactos, Dedup):** Lead/Company/Contact models, deduplication, and the first real AuditLog writes.
- **Deferred to Plan 3 (Deals, Pipeline, Activities, Tasks):** Deal/Activity/Task/AssignmentHistory models, pipeline board UI, "próximo paso" rule.
- **Deferred to Plan 4 (Search, Filters, Import/Export, Dashboard):** global search, per-module filters, CSV import/export, operational dashboard, PEN/USD aggregate views.
- **Deferred to deployment task:** `apps/api` Dockerfile (not needed until the app is deployed somewhere other than the developer's machine).
