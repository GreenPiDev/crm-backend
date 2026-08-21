import { createHash } from 'node:crypto';
import { NestFastifyApplication } from '@nestjs/platform-fastify';
import * as request from 'supertest';
import * as argon2 from 'argon2';
import { createTestApp } from './utils/app';
import { truncateAll, testPrisma } from './utils/db';
import { registerTenant, RegisteredTenant } from './utils/auth';

async function createSalesUser(
  tenantId: string,
  email: string,
  password: string,
) {
  const passwordHash = await argon2.hash(password);
  return testPrisma.user.create({
    data: {
      tenantId,
      email,
      passwordHash,
      fullName: 'Satış Temsilcisi',
      role: 'SALES',
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

describe('Users (e2e)', () => {
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

  describe('GET /users/me', () => {
    it('kimlik doğrulama olmadan 401 döner', async () => {
      const response = await request(app.getHttpServer()).get(
        '/api/v1/users/me',
      );
      expect(response.status).toBe(401);
    });

    it('geçerli tokenla mevcut kullanıcının güncel bilgilerini döner', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${owner.accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        id: owner.userId,
        tenantId: owner.tenantId,
        email: owner.email,
        role: 'OWNER',
      });
      expect(response.body.enabledModules).toEqual(
        expect.arrayContaining(['accounts', 'contacts']),
      );
    });

    it('rolü değiştikten sonra güncel rolü döner', async () => {
      const salesUser = await createSalesUser(
        owner.tenantId,
        'rol-guncel@acme.test',
        'sifre-1234',
      );
      const token = await loginAs(app, salesUser.email, 'sifre-1234');

      await request(app.getHttpServer())
        .patch(`/api/v1/users/${salesUser.id}/role`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ role: 'ADMIN' });

      const response = await request(app.getHttpServer())
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.role).toBe('ADMIN');
    });
  });

  describe('GET /users', () => {
    it('kimlik doğrulama olmadan 401 döner', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/users');
      expect(response.status).toBe(401);
    });

    it('kiracının kullanıcılarını sayfalı döner', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${owner.accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.meta).toEqual({
        page: 1,
        pageSize: 25,
        total: 1,
        totalPages: 1,
      });
    });
  });

  describe('GET /users/:id', () => {
    it('var olmayan kullanıcı için 404 döner', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/users/olmayan-id')
        .set('Authorization', `Bearer ${owner.accessToken}`);

      expect(response.status).toBe(404);
    });
  });

  describe('POST /users/invite', () => {
    it('OWNER davet gönderebilir ve UserInvite kaydı oluşur', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/users/invite')
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({
          email: 'yeni@acme.test',
          fullName: 'Yeni Kişi',
          role: 'SALES',
        });

      expect(response.status).toBe(201);

      const invite = await testPrisma.userInvite.findFirst({
        where: { email: 'yeni@acme.test' },
      });
      expect(invite).not.toBeNull();
      expect(invite?.role).toBe('SALES');
    });

    it('SALES rolü davet gönderemez, 403 döner', async () => {
      const salesUser = await createSalesUser(
        owner.tenantId,
        'satis@acme.test',
        'sifre-1234',
      );
      const token = await loginAs(app, salesUser.email, 'sifre-1234');

      const response = await request(app.getHttpServer())
        .post('/api/v1/users/invite')
        .set('Authorization', `Bearer ${token}`)
        .send({
          email: 'baska@acme.test',
          fullName: 'Başka Kişi',
          role: 'SALES',
        });

      expect(response.status).toBe(403);
    });
  });

  describe('POST /users/accept-invite', () => {
    it('geçerli davet tokenıyla hesap oluşturur', async () => {
      const rawToken = 'test-davet-token';
      const tokenHash = createHash('sha256').update(rawToken).digest('hex');
      await testPrisma.userInvite.create({
        data: {
          tenantId: owner.tenantId,
          email: 'davetli@acme.test',
          fullName: 'Davetli Kişi',
          role: 'SALES',
          tokenHash,
          expiresAt: new Date(Date.now() + 60_000),
        },
      });

      const response = await request(app.getHttpServer())
        .post('/api/v1/users/accept-invite')
        .send({ token: rawToken, password: 'yeni-sifre-123' });

      expect(response.status).toBe(201);

      const loginResponse = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'davetli@acme.test', password: 'yeni-sifre-123' });
      expect(loginResponse.status).toBe(200);
      expect(loginResponse.body.user.role).toBe('SALES');
    });

    it('süresi dolmuş token ile 400 döner', async () => {
      const rawToken = 'suresi-dolmus-token';
      const tokenHash = createHash('sha256').update(rawToken).digest('hex');
      await testPrisma.userInvite.create({
        data: {
          tenantId: owner.tenantId,
          email: 'gecmis@acme.test',
          fullName: 'Geçmiş Kişi',
          role: 'SALES',
          tokenHash,
          expiresAt: new Date(Date.now() - 1000),
        },
      });

      const response = await request(app.getHttpServer())
        .post('/api/v1/users/accept-invite')
        .send({ token: rawToken, password: 'yeni-sifre-123' });

      expect(response.status).toBe(400);
    });
  });

  describe('PATCH /users/:id/role', () => {
    it('OWNER başka kullanıcının rolünü değiştirebilir', async () => {
      const salesUser = await createSalesUser(
        owner.tenantId,
        'rol-degisecek@acme.test',
        'sifre-1234',
      );

      const response = await request(app.getHttpServer())
        .patch(`/api/v1/users/${salesUser.id}/role`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ role: 'ADMIN' });

      expect(response.status).toBe(200);
      expect(response.body.role).toBe('ADMIN');
    });

    it('SALES rol değiştiremez, 403 döner', async () => {
      const salesUser = await createSalesUser(
        owner.tenantId,
        'satis2@acme.test',
        'sifre-1234',
      );
      const token = await loginAs(app, salesUser.email, 'sifre-1234');

      const response = await request(app.getHttpServer())
        .patch(`/api/v1/users/${salesUser.id}/role`)
        .set('Authorization', `Bearer ${token}`)
        .send({ role: 'ADMIN' });

      expect(response.status).toBe(403);
    });
  });
});
