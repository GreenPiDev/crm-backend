import {
  BadRequestException,
  Controller,
  Post,
  Get,
  Req,
  Res,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { Roles } from '../../common/decorators/roles.decorator';
import { ImportsService } from './imports.service';

async function readMultipart(
  req: FastifyRequest,
): Promise<{ buffer: Buffer; mapping?: Record<string, string> }> {
  let buffer: Buffer | undefined;
  let mappingRaw: string | undefined;

  for await (const part of req.parts()) {
    if (part.type === 'file') {
      buffer = await part.toBuffer();
    } else if (part.fieldname === 'mapping') {
      mappingRaw = part.value as string;
    }
  }

  if (!buffer) {
    throw new BadRequestException('Dosya yüklenmedi');
  }

  let mapping: Record<string, string> | undefined;
  if (mappingRaw !== undefined) {
    try {
      mapping = JSON.parse(mappingRaw) as Record<string, string>;
    } catch {
      throw new BadRequestException('mapping alanı geçerli JSON olmalıdır');
    }
  }

  return { buffer, mapping };
}

@Controller('imports')
export class ImportsController {
  constructor(private readonly importsService: ImportsService) {}

  @Roles('OWNER', 'ADMIN', 'SALES')
  @Post('preview')
  async preview(@Req() req: FastifyRequest) {
    const { buffer } = await readMultipart(req);
    return this.importsService.preview(buffer);
  }

  @Roles('OWNER', 'ADMIN', 'SALES')
  @Post('accounts')
  async importAccounts(@Req() req: FastifyRequest) {
    const { buffer, mapping } = await readMultipart(req);
    if (!mapping) {
      throw new BadRequestException("'mapping' alanı zorunludur");
    }
    return this.importsService.importAccounts(buffer, mapping);
  }

  @Roles('OWNER', 'ADMIN', 'SALES')
  @Post('contacts')
  async importContacts(@Req() req: FastifyRequest) {
    const { buffer, mapping } = await readMultipart(req);
    if (!mapping) {
      throw new BadRequestException("'mapping' alanı zorunludur");
    }
    return this.importsService.importContacts(buffer, mapping);
  }

  @Get('accounts/export')
  async exportAccounts(@Res() res: FastifyReply) {
    const buffer = await this.importsService.exportAccounts();
    res
      .header(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      )
      .header('Content-Disposition', 'attachment; filename="firmalar.xlsx"')
      .send(buffer);
  }

  @Get('contacts/export')
  async exportContacts(@Res() res: FastifyReply) {
    const buffer = await this.importsService.exportContacts();
    res
      .header(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      )
      .header('Content-Disposition', 'attachment; filename="kisiler.xlsx"')
      .send(buffer);
  }
}
