import { NestFastifyApplication } from '@nestjs/platform-fastify';
import * as request from 'supertest';
import { createTestApp } from './utils/app';
import { truncateAll, testPrisma } from './utils/db';
import { registerTenant, RegisteredTenant } from './utils/auth';

describe('Contacts (e2e)', () => {
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

  describe('POST /contacts', () => {
    it('kimlik doğrulama olmadan 401 döner', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/contacts')
        .send({ firstName: 'Ahmet', lastName: 'Yılmaz' });
      expect(response.status).toBe(401);
    });

    it('geçerli veriyle kişi oluşturur', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/contacts')
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({
          firstName: 'Ahmet',
          lastName: 'Yılmaz',
          email: 'ahmet@ornek.test',
        });

      expect(response.status).toBe(201);
      expect(response.body.firstName).toBe('Ahmet');
    });

    it('geçersiz veri (soyad eksik) ile 400 döner', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/contacts')
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ firstName: 'Ahmet' });

      expect(response.status).toBe(400);
    });

    it('firmayla ilişkilendirir, var olmayan firma id ile 400 döner', async () => {
      const account = await testPrisma.account.create({
        data: { tenantId: owner.tenantId, name: 'Bağlı Firma' },
      });

      const ok = await request(app.getHttpServer())
        .post('/api/v1/contacts')
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ firstName: 'Ayşe', lastName: 'Demir', accountId: account.id });
      expect(ok.status).toBe(201);
      expect(ok.body.accountId).toBe(account.id);

      const bad = await request(app.getHttpServer())
        .post('/api/v1/contacts')
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({
          firstName: 'Ayşe',
          lastName: 'Demir',
          accountId: 'olmayan-id',
        });
      expect(bad.status).toBe(400);
    });
  });

  describe('GET /contacts', () => {
    it('sayfalı liste döner', async () => {
      await testPrisma.contact.create({
        data: { tenantId: owner.tenantId, firstName: 'A', lastName: 'Z' },
      });
      await testPrisma.contact.create({
        data: { tenantId: owner.tenantId, firstName: 'B', lastName: 'Y' },
      });

      const response = await request(app.getHttpServer())
        .get('/api/v1/contacts')
        .set('Authorization', `Bearer ${owner.accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.meta.total).toBe(2);
    });

    it('soyada göre arama yapar', async () => {
      await testPrisma.contact.create({
        data: { tenantId: owner.tenantId, firstName: 'Ali', lastName: 'Kaya' },
      });
      await testPrisma.contact.create({
        data: { tenantId: owner.tenantId, firstName: 'Veli', lastName: 'Can' },
      });

      const response = await request(app.getHttpServer())
        .get('/api/v1/contacts?q=Kaya')
        .set('Authorization', `Bearer ${owner.accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].lastName).toBe('Kaya');
    });
  });

  describe('GET /contacts/:id', () => {
    it('var olmayan kişi için 404 döner', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/contacts/olmayan-id')
        .set('Authorization', `Bearer ${owner.accessToken}`);
      expect(response.status).toBe(404);
    });
  });

  describe('DELETE /contacts/:id', () => {
    it('kişiyi yumuşak siler', async () => {
      const contact = await testPrisma.contact.create({
        data: {
          tenantId: owner.tenantId,
          firstName: 'Sil',
          lastName: 'İnecek',
        },
      });

      const response = await request(app.getHttpServer())
        .delete(`/api/v1/contacts/${contact.id}`)
        .set('Authorization', `Bearer ${owner.accessToken}`);
      expect(response.status).toBe(204);

      const dbRecord = await testPrisma.contact.findUnique({
        where: { id: contact.id },
      });
      expect(dbRecord?.deletedAt).not.toBeNull();
    });
  });
});
