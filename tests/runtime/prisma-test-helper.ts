import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { PrismaTaskStore } from '@/server/runtime/prisma-store';

export interface PrismaTestContext {
  databaseUrl: string;
  prisma: PrismaClient;
  store: PrismaTaskStore;
  dispose(): Promise<void>;
}

export async function createPrismaTestContext(databaseUrl?: string): Promise<PrismaTestContext> {
  const tempDirectory = databaseUrl ? undefined : await mkdtemp(path.join(tmpdir(), 'wakil-prisma-test-'));
  const resolvedUrl = databaseUrl ?? `file:${path.join(tempDirectory!, 'accounting.db').replace(/\\/g, '/')}`;
  if (!databaseUrl) {
    const prismaCli = path.join(process.cwd(), 'node_modules', 'prisma', 'build', 'index.js');
    execFileSync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: resolvedUrl, RUST_LOG: 'info' },
      stdio: 'pipe',
    });
  }
  const prisma = new PrismaClient({ datasources: { db: { url: resolvedUrl } } });
  const store = new PrismaTaskStore(prisma);
  return {
    databaseUrl: resolvedUrl,
    prisma,
    store,
    async dispose() {
      await prisma.$disconnect();
      if (tempDirectory) await rm(tempDirectory, { recursive: true, force: true });
    },
  };
}
