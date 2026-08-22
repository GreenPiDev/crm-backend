import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';

export default async function globalTeardown(): Promise<void> {
  const container = (
    global as unknown as { __PG_CONTAINER__?: StartedPostgreSqlContainer }
  ).__PG_CONTAINER__;
  await container?.stop();
}
