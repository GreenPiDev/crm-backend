import { NestFastifyApplication } from '@nestjs/platform-fastify';
import * as request from 'supertest';
import { createTestApp } from './utils/app';
import { truncateAll, testPrisma } from './utils/db';
import { registerTenant } from './utils/auth';

describe('Auth (e2e)', () => {
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

  describe('POST /auth/register', () => {
    it('yeni kiracı + OWNER kullanıcı oluşturur ve token döner', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          tenantName: 'Acme Yazılım',
          fullName: 'Ayşe Yılmaz',
          email: 'ayse@acme.test',
          password: 'guclu-sifre-123',
        });

      expect(response.status).toBe(201);
      expect(response.body.user.role).toBe('OWNER');
      expect(response.body.user.email).toBe('ayse@acme.test');
      expect(response.body.user.enabledModules).toEqual(
        expect.arrayContaining(['accounts', 'contacts']),
      );
      expect(typeof response.body.tokens.accessToken).toBe('string');
      expect(typeof response.body.tokens.refreshToken).toBe('string');
    });

    it('geçersiz e-posta ile 400 döner', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          tenantName: 'Acme',
          fullName: 'Ayşe Yılmaz',
          email: 'gecersiz-eposta',
          password: 'guclu-sifre-123',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('VALIDATION_ERROR');
      expect(response.body.details).toEqual(
        expect.arrayContaining([expect.objectContaining({ path: 'email' })]),
      );
    });

    it('aynı e-posta ile ikinci kayıt 409 döner', async () => {
      await registerTenant(app, { email: 'tekrar@acme.test' });

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          tenantName: 'Başka Firma',
          fullName: 'Başka Kişi',
          email: 'tekrar@acme.test',
          password: 'guclu-sifre-123',
        });

      expect(response.status).toBe(409);
    });
  });

  describe('POST /auth/login', () => {
    it('doğru bilgilerle giriş yapar', async () => {
      const tenant = await registerTenant(app, {
        email: 'giris@acme.test',
        password: 'dogru-sifre-1',
      });

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: tenant.email,
          password: tenant.password,
        });

      expect(response.status).toBe(200);
      expect(response.body.user.email).toBe(tenant.email);
      expect(typeof response.body.tokens.accessToken).toBe('string');
    });

    it('yanlış şifreyle 401 ve Türkçe mesaj döner', async () => {
      const tenant = await registerTenant(app, { email: 'yanlis@acme.test' });

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: tenant.email,
          password: 'yanlis-sifre',
        });

      expect(response.status).toBe(401);
      expect(response.body.message).toBe('E-posta veya şifre hatalı');
    });

    it('olmayan e-posta ile de aynı genel mesajla 401 döner (kullanıcı sayımlaması yok)', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: 'yok@acme.test',
          password: 'herhangi-bir-sifre',
        });

      expect(response.status).toBe(401);
      expect(response.body.message).toBe('E-posta veya şifre hatalı');
    });
  });

  describe('POST /auth/refresh', () => {
    it('geçerli refresh token ile yeni token çifti üretir ve eskisini geçersiz kılar', async () => {
      const tenant = await registerTenant(app);

      const refreshResponse = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: tenant.refreshToken });

      expect(refreshResponse.status).toBe(200);
      expect(refreshResponse.body.accessToken).toBeDefined();
      expect(refreshResponse.body.refreshToken).not.toBe(tenant.refreshToken);

      const reuseResponse = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: tenant.refreshToken });

      expect(reuseResponse.status).toBe(401);
    });

    it('geçersiz refresh token ile 401 döner', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: 'gecersiz-token' });

      expect(response.status).toBe(401);
    });
  });

  describe('POST /auth/logout', () => {
    it('geçerli refresh tokenı iptal eder', async () => {
      const tenant = await registerTenant(app);

      const logoutResponse = await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${tenant.accessToken}`)
        .send({ refreshToken: tenant.refreshToken });

      expect(logoutResponse.status).toBe(200);

      const refreshResponse = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: tenant.refreshToken });

      expect(refreshResponse.status).toBe(401);
    });

    it('token olmadan 401 döner', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .send({ refreshToken: 'herhangi' });

      expect(response.status).toBe(401);
    });
  });

  describe('POST /auth/change-password', () => {
    it('mevcut şifre doğruysa şifreyi değiştirir ve yeni şifreyle giriş yapılabilir', async () => {
      const tenant = await registerTenant(app, { password: 'eski-sifre-123' });

      const changeResponse = await request(app.getHttpServer())
        .post('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${tenant.accessToken}`)
        .send({
          currentPassword: 'eski-sifre-123',
          newPassword: 'yeni-sifre-456',
        });

      expect(changeResponse.status).toBe(200);

      const loginResponse = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: tenant.email,
          password: 'yeni-sifre-456',
        });

      expect(loginResponse.status).toBe(200);
    });

    it('mevcut şifre yanlışsa 401 döner', async () => {
      const tenant = await registerTenant(app);

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${tenant.accessToken}`)
        .send({ currentPassword: 'yanlis', newPassword: 'yeni-sifre-456' });

      expect(response.status).toBe(401);
    });
  });
});
