import { NestFastifyApplication } from '@nestjs/platform-fastify';
import * as request from 'supertest';
import * as XLSX from 'xlsx';
import { createTestApp } from './utils/app';
import { truncateAll, testPrisma } from './utils/db';
import { registerTenant, RegisteredTenant } from './utils/auth';

function buildXlsxBuffer(rows: Record<string, string>[]): Buffer {
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Sayfa1');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

describe('Imports (e2e)', () => {
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

  describe('POST /imports/preview', () => {
    it('kimlik doğrulama olmadan 401 döner', async () => {
      const buffer = buildXlsxBuffer([{ 'Firma Adı': 'Acme' }]);
      const response = await request(app.getHttpServer())
        .post('/api/v1/imports/preview')
        .attach('file', buffer, 'firmalar.xlsx');
      expect(response.status).toBe(401);
    });

    it('başlıkları ve örnek satırları döner', async () => {
      const buffer = buildXlsxBuffer([
        { 'Firma Adı': 'Acme A.Ş.', Şehir: 'İstanbul' },
        { 'Firma Adı': 'Beta Ltd.', Şehir: 'Ankara' },
      ]);

      const response = await request(app.getHttpServer())
        .post('/api/v1/imports/preview')
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .attach('file', buffer, 'firmalar.xlsx');

      expect(response.status).toBe(201);
      expect(response.body.headers).toEqual(
        expect.arrayContaining(['Firma Adı', 'Şehir']),
      );
      expect(response.body.totalRows).toBe(2);
      expect(response.body.sampleRows).toHaveLength(2);
    });
  });

  describe('POST /imports/accounts — 200 satırlık örnek dosya', () => {
    it('hatalı satırları raporlar, doğruları içe aktarır', async () => {
      const rows: Record<string, string>[] = [];
      for (let i = 1; i <= 200; i++) {
        // 40 satırda isim boş bırakılarak kasıtlı hata üretiliyor
        const isInvalid = i % 5 === 0;
        rows.push({
          'Firma Adı': isInvalid ? '' : `Firma ${i}`,
          Şehir: 'İstanbul',
          'E-posta': isInvalid ? 'gecersiz-eposta' : `firma${i}@ornek.test`,
        });
      }
      const buffer = buildXlsxBuffer(rows);
      const mapping = JSON.stringify({
        name: 'Firma Adı',
        city: 'Şehir',
        email: 'E-posta',
      });

      const response = await request(app.getHttpServer())
        .post('/api/v1/imports/accounts')
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .field('mapping', mapping)
        .attach('file', buffer, 'firmalar.xlsx');

      expect(response.status).toBe(201);
      expect(response.body.totalRows).toBe(200);
      expect(response.body.imported).toBe(160);
      expect(response.body.errors).toHaveLength(40);

      const count = await testPrisma.account.count();
      expect(count).toBe(160);
    });

    it("mapping'de name eşlenmemişse 400 döner", async () => {
      const buffer = buildXlsxBuffer([{ 'Firma Adı': 'Acme' }]);
      const response = await request(app.getHttpServer())
        .post('/api/v1/imports/accounts')
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .field('mapping', JSON.stringify({ city: 'Şehir' }))
        .attach('file', buffer, 'firmalar.xlsx');

      expect(response.status).toBe(400);
    });

    it('VIEWER içe aktaramaz, 403 döner', async () => {
      const argon2 = await import('argon2');
      const passwordHash = await argon2.hash('sifre-1234');
      const viewer = await testPrisma.user.create({
        data: {
          tenantId: owner.tenantId,
          email: 'izleyici@acme.test',
          passwordHash,
          fullName: 'İzleyici',
          role: 'VIEWER',
        },
      });
      const loginResponse = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: viewer.email, password: 'sifre-1234' });
      const token = loginResponse.body.tokens.accessToken as string;

      const buffer = buildXlsxBuffer([{ 'Firma Adı': 'Acme' }]);
      const response = await request(app.getHttpServer())
        .post('/api/v1/imports/accounts')
        .set('Authorization', `Bearer ${token}`)
        .field('mapping', JSON.stringify({ name: 'Firma Adı' }))
        .attach('file', buffer, 'firmalar.xlsx');

      expect(response.status).toBe(403);
    });
  });

  describe('POST /imports/contacts', () => {
    it('firma id eşleşmezse hata olarak raporlar', async () => {
      const buffer = buildXlsxBuffer([
        { Ad: 'Ahmet', Soyad: 'Yılmaz', Firma: 'olmayan-id' },
      ]);
      const mapping = JSON.stringify({
        firstName: 'Ad',
        lastName: 'Soyad',
        accountId: 'Firma',
      });

      const response = await request(app.getHttpServer())
        .post('/api/v1/imports/contacts')
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .field('mapping', mapping)
        .attach('file', buffer, 'kisiler.xlsx');

      expect(response.status).toBe(201);
      expect(response.body.imported).toBe(0);
      expect(response.body.errors).toHaveLength(1);
    });

    it('geçerli satırları içe aktarır', async () => {
      const buffer = buildXlsxBuffer([
        { Ad: 'Ahmet', Soyad: 'Yılmaz' },
        { Ad: 'Ayşe', Soyad: 'Demir' },
      ]);
      const mapping = JSON.stringify({ firstName: 'Ad', lastName: 'Soyad' });

      const response = await request(app.getHttpServer())
        .post('/api/v1/imports/contacts')
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .field('mapping', mapping)
        .attach('file', buffer, 'kisiler.xlsx');

      expect(response.status).toBe(201);
      expect(response.body.imported).toBe(2);
      const count = await testPrisma.contact.count();
      expect(count).toBe(2);
    });
  });

  describe('GET /imports/accounts/export', () => {
    it('kiracının firmalarını xlsx olarak döner', async () => {
      await testPrisma.account.create({
        data: { tenantId: owner.tenantId, name: 'Dışa Aktarılacak Firma' },
      });

      const response = await request(app.getHttpServer())
        .get('/api/v1/imports/accounts/export')
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .buffer()
        .parse((res, callback) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => callback(null, Buffer.concat(chunks)));
        });

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('spreadsheetml');

      const workbook = XLSX.read(response.body as Buffer, { type: 'buffer' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<Record<string, string>>(sheet);
      expect(json).toHaveLength(1);
      expect(json[0].Ad).toBe('Dışa Aktarılacak Firma');
    });
  });
});
