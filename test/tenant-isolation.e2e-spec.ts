import { NestFastifyApplication } from '@nestjs/platform-fastify';
import * as request from 'supertest';
import { createTestApp } from './utils/app';
import { truncateAll, testPrisma } from './utils/db';
import { registerTenant } from './utils/auth';

describe('Kiracı izolasyonu (e2e)', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
    await testPrisma.$disconnect();
  });

  beforeEach(async () => {
    await truncateAll();
  });

  it('A kiracısının kullanıcısı, B kiracısının kullanıcı kaydına id ile eriştiğinde 404 alır', async () => {
    const tenantA = await registerTenant(app, { tenantName: 'A Firması' });
    const tenantB = await registerTenant(app, { tenantName: 'B Firması' });

    const response = await request(app.getHttpServer())
      .get(`/api/v1/users/${tenantB.userId}`)
      .set('Authorization', `Bearer ${tenantA.accessToken}`);

    expect(response.status).toBe(404);
  });

  it('A kiracısının kullanıcı listesinde B kiracısının kullanıcıları görünmez', async () => {
    const tenantA = await registerTenant(app, { tenantName: 'A Firması' });
    await registerTenant(app, { tenantName: 'B Firması' });

    const response = await request(app.getHttpServer())
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${tenantA.accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].id).toBe(tenantA.userId);
  });

  it("A kiracısının OWNER'ı, B kiracısının kullanıcısının rolünü değiştiremez (404)", async () => {
    const tenantA = await registerTenant(app, { tenantName: 'A Firması' });
    const tenantB = await registerTenant(app, { tenantName: 'B Firması' });

    const response = await request(app.getHttpServer())
      .patch(`/api/v1/users/${tenantB.userId}/role`)
      .set('Authorization', `Bearer ${tenantA.accessToken}`)
      .send({ role: 'ADMIN' });

    expect(response.status).toBe(404);
  });
});
