import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { DiscoveryModule, DiscoveryService, Reflector } from '@nestjs/core';
import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { IS_PUBLIC_KEY } from '../src/common/decorators/public.decorator';

const METHOD_NAMES: Record<number, string> = {
  [RequestMethod.GET]: 'get',
  [RequestMethod.POST]: 'post',
  [RequestMethod.PUT]: 'put',
  [RequestMethod.DELETE]: 'delete',
  [RequestMethod.PATCH]: 'patch',
};

function joinPaths(...segments: string[]): string {
  return (
    '/' +
    segments
      .filter(Boolean)
      .map((s) => s.replace(/^\/+|\/+$/g, ''))
      .filter(Boolean)
      .join('/')
  );
}

describe('Route koruması (e2e)', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule, DiscoveryModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    app.setGlobalPrefix('api/v1');
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('@Public işaretlenmemiş her uç nokta kimlik doğrulama olmadan 401 döner', async () => {
    const discovery = app.get(DiscoveryService);
    const reflector = app.get(Reflector);
    const controllers = discovery.getControllers();

    const checked: string[] = [];

    for (const wrapper of controllers) {
      const instance = wrapper.instance;
      if (!instance) continue;
      const prototype = Object.getPrototypeOf(instance);
      const controllerPath: string =
        Reflect.getMetadata(PATH_METADATA, instance.constructor) ?? '';
      const methodNames = Object.getOwnPropertyNames(prototype).filter(
        (m) => m !== 'constructor',
      );

      for (const methodName of methodNames) {
        const handler = prototype[methodName];
        const routePath = Reflect.getMetadata(PATH_METADATA, handler);
        const requestMethod = Reflect.getMetadata(METHOD_METADATA, handler);
        if (routePath === undefined || requestMethod === undefined) continue;

        const isPublic =
          reflector.get<boolean>(IS_PUBLIC_KEY, handler) ?? false;
        if (isPublic) continue;

        const httpMethod = METHOD_NAMES[requestMethod];
        if (!httpMethod) continue;

        const fullPath = joinPaths('api/v1', controllerPath, routePath).replace(
          /\/:[^/]+/g,
          '/test-id',
        );
        checked.push(`${httpMethod.toUpperCase()} ${fullPath}`);

        const agent = request(app.getHttpServer()) as unknown as Record<
          string,
          (path: string) => request.Test
        >;
        const response = await agent[httpMethod](fullPath).send({});
        expect({
          route: `${httpMethod.toUpperCase()} ${fullPath}`,
          status: response.status,
        }).toEqual({
          route: `${httpMethod.toUpperCase()} ${fullPath}`,
          status: 401,
        });
      }
    }

    expect(checked.length).toBeGreaterThan(0);
  });
});
