import { NestFastifyApplication } from '@nestjs/platform-fastify';
import * as request from 'supertest';
import * as argon2 from 'argon2';
import { createTestApp } from './utils/app';
import { truncateAll, testPrisma } from './utils/db';
import { registerTenant, RegisteredTenant } from './utils/auth';

async function createViewer(tenantId: string, email: string, password: string) {
  const passwordHash = await argon2.hash(password);
  return testPrisma.user.create({
    data: {
      tenantId,
      email,
      passwordHash,
      fullName: 'İzleyici',
      role: 'VIEWER',
    },
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

describe('Accounts (e2e)', () => {
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

  describe('POST /accounts', () => {
    it('kimlik doğrulama olmadan 401 döner', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/accounts')
        .send({ name: 'Acme A.Ş.' });
      expect(response.status).toBe(401);
    });

    it('geçerli veriyle firma oluşturur', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/accounts')
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ name: 'Acme A.Ş.', city: 'İstanbul', taxNumber: '1234567890' });

      expect(response.status).toBe(201);
      expect(response.body.name).toBe('Acme A.Ş.');
      expect(response.body.city).toBe('İstanbul');
    });

    it('geçersiz veri (kısa isim) ile 400 döner', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/accounts')
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ name: 'A' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('VALIDATION_ERROR');
    });

    it('geçersiz vergi no ile 400 döner', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/accounts')
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ name: 'Acme A.Ş.', taxNumber: '1111111111' });

      expect(response.status).toBe(400);
    });

    it('VIEWER rolü firma oluşturamaz, 403 döner', async () => {
      const viewer = await createViewer(
        owner.tenantId,
        'izleyici@acme.test',
        'sifre-1234',
      );
      const token = await loginAs(app, viewer.email, 'sifre-1234');

      const response = await request(app.getHttpServer())
        .post('/api/v1/accounts')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Acme A.Ş.' });

      expect(response.status).toBe(403);
    });
  });

  describe('GET /accounts', () => {
    it('sayfalı liste döner', async () => {
      for (let i = 1; i <= 3; i++) {
        await testPrisma.account.create({
          data: { tenantId: owner.tenantId, name: `Firma ${i}` },
        });
      }

      const response = await request(app.getHttpServer())
        .get('/api/v1/accounts?page=1&pageSize=2')
        .set('Authorization', `Bearer ${owner.accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.meta).toEqual({
        page: 1,
        pageSize: 2,
        total: 3,
        totalPages: 2,
      });
    });

    it('isme göre arama yapar', async () => {
      await testPrisma.account.create({
        data: { tenantId: owner.tenantId, name: 'Beta Teknoloji' },
      });
      await testPrisma.account.create({
        data: { tenantId: owner.tenantId, name: 'Gamma Yazılım' },
      });

      const response = await request(app.getHttpServer())
        .get('/api/v1/accounts?q=Beta')
        .set('Authorization', `Bearer ${owner.accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].name).toBe('Beta Teknoloji');
    });

    it('sil (soft delete) sonrası listede görünmez', async () => {
      const account = await testPrisma.account.create({
        data: { tenantId: owner.tenantId, name: 'Silinecek Firma' },
      });

      const deleteResponse = await request(app.getHttpServer())
        .delete(`/api/v1/accounts/${account.id}`)
        .set('Authorization', `Bearer ${owner.accessToken}`);
      expect(deleteResponse.status).toBe(204);

      const listResponse = await request(app.getHttpServer())
        .get('/api/v1/accounts')
        .set('Authorization', `Bearer ${owner.accessToken}`);
      expect(listResponse.body.data).toHaveLength(0);

      const dbRecord = await testPrisma.account.findUnique({
        where: { id: account.id },
      });
      expect(dbRecord?.deletedAt).not.toBeNull();
    });
  });

  describe('GET /accounts/:id', () => {
    it('var olmayan firma için 404 döner', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/accounts/olmayan-id')
        .set('Authorization', `Bearer ${owner.accessToken}`);
      expect(response.status).toBe(404);
    });
  });

  describe('PATCH /accounts/:id', () => {
    it('firmayı günceller', async () => {
      const account = await testPrisma.account.create({
        data: { tenantId: owner.tenantId, name: 'Eski İsim' },
      });

      const response = await request(app.getHttpServer())
        .patch(`/api/v1/accounts/${account.id}`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ name: 'Yeni İsim' });

      expect(response.status).toBe(200);
      expect(response.body.name).toBe('Yeni İsim');
    });
  });

  describe('DELETE /accounts/:id', () => {
    it('VIEWER silemez, 403 döner', async () => {
      const account = await testPrisma.account.create({
        data: { tenantId: owner.tenantId, name: 'Silinemez Firma' },
      });
      const viewer = await createViewer(
        owner.tenantId,
        'izleyici2@acme.test',
        'sifre-1234',
      );
      const token = await loginAs(app, viewer.email, 'sifre-1234');

      const response = await request(app.getHttpServer())
        .delete(`/api/v1/accounts/${account.id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(403);
    });
  });
});
