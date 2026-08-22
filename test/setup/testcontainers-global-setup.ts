import { execSync } from 'child_process';
import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';

// Colima'nın VM'i Ryuk reaper sidecar'ının socket bind-mount'unu desteklemiyor;
// bu yüzden reaper devre dışı bırakılır ve container'lar globalTeardown'da elle durdurulur.
process.env.TESTCONTAINERS_RYUK_DISABLED = 'true';

export default async function globalSetup(): Promise<void> {
  const container = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('crm_test')
    .withUsername('crm_test')
    .withPassword('crm_test')
    .start();

  const databaseUrl = container.getConnectionUri();

  execSync('npx prisma migrate deploy', {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'inherit',
  });

  process.env.DATABASE_URL = databaseUrl;

  // globalSetup ve globalTeardown Jest'in ana sürecinde (worker sandbox'ı
  // dışında) çalışır, bu yüzden aradaki container referansı global ile taşınır.
  (
    global as unknown as { __PG_CONTAINER__?: StartedPostgreSqlContainer }
  ).__PG_CONTAINER__ = container;
}
