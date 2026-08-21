import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import { ZodValidationException } from 'nestjs-zod';
import type { ZodError } from 'zod';
import type { FastifyReply } from 'fastify';

interface ErrorDetail {
  path: string;
  message: string;
}

interface ErrorBody {
  statusCode: number;
  error: string;
  message: string;
  details?: ErrorDetail[];
}

const DEFAULT_MESSAGES: Record<number, { error: string; message: string }> = {
  400: { error: 'VALIDATION_ERROR', message: 'Doğrulama hatası' },
  401: { error: 'UNAUTHORIZED', message: 'Kimlik doğrulama gerekli' },
  403: { error: 'FORBIDDEN', message: 'Bu işlem için yetkiniz yok' },
  404: { error: 'NOT_FOUND', message: 'Kayıt bulunamadı' },
  409: { error: 'CONFLICT', message: 'Kayıt zaten mevcut' },
  429: {
    error: 'TOO_MANY_REQUESTS',
    message: 'Çok fazla istek gönderildi, lütfen biraz bekleyin',
  },
};

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<FastifyReply>();

    if (exception instanceof ZodValidationException) {
      const zodError = exception.getZodError() as ZodError;
      const body: ErrorBody = {
        statusCode: 400,
        error: 'VALIDATION_ERROR',
        message: 'Doğrulama hatası',
        details: zodError.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      };
      response.status(400).send(body);
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const defaults = DEFAULT_MESSAGES[status] ?? {
        error: 'ERROR',
        message: 'Bir hata oluştu',
      };
      const exceptionBody = exception.getResponse();
      const rawMessage =
        typeof exceptionBody === 'string'
          ? exceptionBody
          : ((exceptionBody as { message?: string | string[] }).message ??
            defaults.message);

      const body: ErrorBody = {
        statusCode: status,
        error: defaults.error,
        message: Array.isArray(rawMessage)
          ? (rawMessage[0] ?? defaults.message)
          : rawMessage,
      };
      response.status(status).send(body);
      return;
    }

    this.logger.error(exception);
    const body: ErrorBody = {
      statusCode: 500,
      error: 'INTERNAL_ERROR',
      message: 'Beklenmeyen bir hata oluştu',
    };
    response.status(500).send(body);
  }
}
