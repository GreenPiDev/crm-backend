import { NestFastifyApplication } from '@nestjs/platform-fastify';
import * as request from 'supertest';
import { createTestApp } from './utils/app';
import { truncateAll, testPrisma } from './utils/db';
import { registerTenant, RegisteredTenant } from './utils/auth';

async function toggleModule(
  app: NestFastifyApplication,
  token: string,
  moduleKey: string,
  enabled: boolean,
) {
  const response = await request(app.getHttpServer())
    .patch(`/api/v1/tenant-modules/${moduleKey}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ enabled });
  expect(response.status).toBe(200);
}

async function reLogin(
  app: NestFastifyApplication,
  email: string,
  password: string,
) {
  const response = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email, password });
  return response.body.tokens.accessToken as string;
}

describe('Modül kapısı (e2e)', () => {
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

  it('accounts modülü kapatılınca ilgili uçlar 403 Türkçe mesajla döner, yeniden açılınca 200 döner', async () => {
    await toggleModule(app, owner.accessToken, 'accounts', false);
    // Token'a gömülü enabledModules bir sonraki login'e kadar eski kalır (kabul
    // edilmiş tasarım — bkz. NOTLAR.md), bu yüzden testte açıkça yeniden giriş yapılır.
    const token = await reLogin(app, owner.email, owner.password);

    const listResponse = await request(app.getHttpServer())
      .get('/api/v1/accounts')
      .set('Authorization', `Bearer ${token}`);
    expect(listResponse.status).toBe(403);
    expect(listResponse.body.message).toBe(
      'Bu modül kiracınız için etkin değil',
    );

    const importResponse = await request(app.getHttpServer())
      .post('/api/v1/imports/accounts')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from('ad\nAcme'), 'test.csv')
      .field('mapping', JSON.stringify({ name: 'ad' }));
    expect(importResponse.status).toBe(403);

    await toggleModule(app, token, 'accounts', true);
    const restoredToken = await reLogin(app, owner.email, owner.password);
    const restoredResponse = await request(app.getHttpServer())
      .get('/api/v1/accounts')
      .set('Authorization', `Bearer ${restoredToken}`);
    expect(restoredResponse.status).toBe(200);
  });

  it('contacts modülü kapatılınca ilgili uçlar 403 döner, accounts etkilenmez', async () => {
    await toggleModule(app, owner.accessToken, 'contacts', false);
    const token = await reLogin(app, owner.email, owner.password);

    const contactsResponse = await request(app.getHttpServer())
      .get('/api/v1/contacts')
      .set('Authorization', `Bearer ${token}`);
    expect(contactsResponse.status).toBe(403);
    expect(contactsResponse.body.message).toBe(
      'Bu modül kiracınız için etkin değil',
    );

    const accountsResponse = await request(app.getHttpServer())
      .get('/api/v1/accounts')
      .set('Authorization', `Bearer ${token}`);
    expect(accountsResponse.status).toBe(200);

    const importContactsResponse = await request(app.getHttpServer())
      .post('/api/v1/imports/contacts')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from('ad\nAyşe'), 'test.csv')
      .field('mapping', JSON.stringify({ firstName: 'ad' }));
    expect(importContactsResponse.status).toBe(403);
  });
});
