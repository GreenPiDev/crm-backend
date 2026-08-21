import { NestFastifyApplication } from '@nestjs/platform-fastify';
import * as request from 'supertest';

export interface RegisteredTenant {
  accessToken: string;
  refreshToken: string;
  userId: string;
  tenantId: string;
  email: string;
  password: string;
}

let counter = 0;

export async function registerTenant(
  app: NestFastifyApplication,
  overrides: Partial<{
    tenantName: string;
    fullName: string;
    email: string;
    password: string;
  }> = {},
): Promise<RegisteredTenant> {
  counter += 1;
  const email = overrides.email ?? `sahibi${counter}@ornek.test`;
  const password = overrides.password ?? 'guclu-sifre-123';

  const response = await request(app.getHttpServer())
    .post('/api/v1/auth/register')
    .send({
      tenantName: overrides.tenantName ?? `Test Firma ${counter}`,
      fullName: overrides.fullName ?? 'Test Sahibi',
      email,
      password,
    });

  if (response.status !== 201 && response.status !== 200) {
    throw new Error(`Kayıt başarısız: ${JSON.stringify(response.body)}`);
  }

  return {
    accessToken: response.body.tokens.accessToken,
    refreshToken: response.body.tokens.refreshToken,
    userId: response.body.user.id,
    tenantId: response.body.user.tenantId,
    email,
    password,
  };
}
