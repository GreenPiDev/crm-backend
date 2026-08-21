import { NestFastifyApplication } from '@nestjs/platform-fastify';
import * as request from 'supertest';
import * as argon2 from 'argon2';
import { createTestApp } from './utils/app';
import { truncateAll, testPrisma } from './utils/db';
import { registerTenant, RegisteredTenant } from './utils/auth';

async function createUser(
  tenantId: string,
  email: string,
  password: string,
  role: 'ADMIN' | 'SALES' | 'VIEWER',
) {
  const passwordHash = await argon2.hash(password);
  return testPrisma.user.create({
    data: { tenantId, email, passwordHash, fullName: 'Test Kullanıcı', role },
  });
}

async function loginAs(
  app: NestFastifyApplication,
  email: string,
  password: string,
) {
  const response = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email, password });
  return response.body.tokens.accessToken as string;
}

describe('Tenant Modules (e2e)', () => {
  let app: NestFastifyApplication;
  let owner: RegisteredTenant;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
    await testPrisma.$disconnect();
  });

  beforeEach(async () => {
    await truncateAll();
    owner = await registerTenant(app);
  });

  describe('GET /tenant-modules', () => {
    it('kimlik doğrulama olmadan 401 döner', async () => {
      const response = await request(app.getHttpServer()).get(
        '/api/v1/tenant-modules',
      );
      expect(response.status).toBe(401);
    });

    it('kayıt sonrası tüm katalog modülleri açık döner', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/tenant-modules')
        .set('Authorization', `Bearer ${owner.accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual(
        expect.arrayContaining([
          { key: 'accounts', label: 'Firmalar', enabled: true },
          { key: 'contacts', label: 'Kişiler', enabled: true },
        ]),
      );
    });
  });

  describe('PATCH /tenant-modules/:key', () => {
    it('OWNER bir modülü kapatabilir', async () => {
      const patchResponse = await request(app.getHttpServer())
        .patch('/api/v1/tenant-modules/contacts')
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ enabled: false });

      expect(patchResponse.status).toBe(200);
      expect(patchResponse.body).toEqual({
        key: 'contacts',
        label: 'Kişiler',
        enabled: false,
      });

      const listResponse = await request(app.getHttpServer())
        .get('/api/v1/tenant-modules')
        .set('Authorization', `Bearer ${owner.accessToken}`);
      expect(listResponse.body).toEqual(
        expect.arrayContaining([
          { key: 'contacts', label: 'Kişiler', enabled: false },
        ]),
      );
    });

    it.each(['ADMIN', 'SALES', 'VIEWER'] as const)(
      '%s rolü modül değiştiremez, 403 döner',
      async (role) => {
        const user = await createUser(
          owner.tenantId,
          `${role.toLowerCase()}@acme.test`,
          'sifre-1234',
          role,
        );
        const token = await loginAs(app, user.email, 'sifre-1234');

        const response = await request(app.getHttpServer())
          .patch('/api/v1/tenant-modules/contacts')
          .set('Authorization', `Bearer ${token}`)
          .send({ enabled: false });

        expect(response.status).toBe(403);
      },
    );

    it('bilinmeyen modül anahtarı için 400 Türkçe hata döner', async () => {
      const response = await request(app.getHttpServer())
        .patch('/api/v1/tenant-modules/olmayan-modul')
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ enabled: false });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Geçersiz modül anahtarı');
    });

    it('kiracı izolasyonu: bir kiracının değişikliği diğerini etkilemez', async () => {
      const otherTenant = await registerTenant(app);

      await request(app.getHttpServer())
        .patch('/api/v1/tenant-modules/contacts')
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ enabled: false });

      const otherListResponse = await request(app.getHttpServer())
        .get('/api/v1/tenant-modules')
        .set('Authorization', `Bearer ${otherTenant.accessToken}`);

      expect(otherListResponse.body).toEqual(
        expect.arrayContaining([
          { key: 'contacts', label: 'Kişiler', enabled: true },
        ]),
      );
    });
  });
});
