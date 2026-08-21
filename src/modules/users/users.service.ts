import { randomBytes, createHash } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  TENANT_PRISMA,
  TenantPrismaClient,
} from '../../common/prisma/tenant-prisma.provider';
import { MailService } from '../mail/mail.service';
import { TenantModulesService } from '../tenant-modules/tenant-modules.service';
import type { InviteUserDto } from './dto/invite-user.dto';
import type { AcceptInviteDto } from './dto/accept-invite.dto';
import type { UpdateRoleDto } from './dto/update-role.dto';

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(TENANT_PRISMA) private readonly tenantPrisma: TenantPrismaClient,
    private readonly mailService: MailService,
    private readonly tenantModulesService: TenantModulesService,
  ) {}

  async getMe(userId: string, tenantId: string) {
    const user = await this.tenantPrisma.user.findFirst({
      where: { id: userId },
      select: { id: true, email: true, fullName: true, role: true },
    });
    if (!user) {
      throw new NotFoundException('Kullanıcı bulunamadı');
    }

    const enabledModules =
      await this.tenantModulesService.getEnabledModuleKeys();

    return { ...user, tenantId, enabledModules };
  }

  async list(page: number, pageSize: number) {
    const [data, total] = await Promise.all([
      this.tenantPrisma.user.findMany({
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { fullName: 'asc' },
        select: {
          id: true,
          email: true,
          fullName: true,
          role: true,
          isActive: true,
          lastLoginAt: true,
        },
      }),
      this.tenantPrisma.user.count(),
    ]);

    return {
      data,
      meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    };
  }

  async findOne(id: string) {
    const user = await this.tenantPrisma.user.findFirst({
      where: { id },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        isActive: true,
        lastLoginAt: true,
      },
    });
    if (!user) {
      throw new NotFoundException('Kullanıcı bulunamadı');
    }
    return user;
  }

  async invite(
    tenantId: string,
    tenantName: string,
    inviterName: string,
    dto: InviteUserDto,
  ) {
    const existingUser = await this.tenantPrisma.user.findFirst({
      where: { email: dto.email },
    });
    if (existingUser) {
      throw new ConflictException('Bu e-posta adresi zaten bu firmada kayıtlı');
    }

    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');

    // tenantId, tenant-izolasyon uzantısı tarafından çalışma zamanında eklenir
    await this.tenantPrisma.userInvite.upsert({
      where: { tenantId_email: { tenantId, email: dto.email } },
      create: {
        email: dto.email,
        fullName: dto.fullName,
        role: dto.role,
        tokenHash,
        expiresAt: new Date(Date.now() + INVITE_TTL_MS),
      } as never,
      update: {
        fullName: dto.fullName,
        role: dto.role,
        tokenHash,
        expiresAt: new Date(Date.now() + INVITE_TTL_MS),
        acceptedAt: null,
      },
    });

    await this.mailService.sendInvite({
      to: dto.email,
      tenantName,
      inviterName,
      inviteUrl: `http://localhost:5173/davet/kabul-et?token=${rawToken}`,
    });

    return { success: true };
  }

  async acceptInvite(dto: AcceptInviteDto) {
    const tokenHash = createHash('sha256').update(dto.token).digest('hex');
    const invalidInvite = () =>
      new BadRequestException('Geçersiz veya süresi dolmuş davet');

    const invite = await this.prisma.userInvite.findFirst({
      where: { tokenHash, acceptedAt: null },
    });
    if (!invite || invite.expiresAt < new Date()) {
      throw invalidInvite();
    }

    const passwordHash = await argon2.hash(dto.password);

    await this.prisma.$transaction([
      this.prisma.user.create({
        data: {
          tenantId: invite.tenantId,
          email: invite.email,
          fullName: invite.fullName,
          role: invite.role,
          passwordHash,
        },
      }),
      this.prisma.userInvite.update({
        where: { id: invite.id },
        data: { acceptedAt: new Date() },
      }),
    ]);

    return { success: true };
  }

  async updateRole(userId: string, dto: UpdateRoleDto) {
    const user = await this.tenantPrisma.user.findFirst({
      where: { id: userId },
    });
    if (!user) {
      throw new NotFoundException('Kullanıcı bulunamadı');
    }

    return this.tenantPrisma.user.update({
      where: { id: userId },
      data: { role: dto.role },
      select: { id: true, email: true, fullName: true, role: true },
    });
  }
}
