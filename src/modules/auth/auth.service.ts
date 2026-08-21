import {
  ConflictException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import type { Role } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  TENANT_PRISMA,
  TenantPrismaClient,
} from '../../common/prisma/tenant-prisma.provider';
import { TenantContext } from '../../common/tenant/tenant-context';
import { slugify } from '../../common/utils/slug';
import { TokenService, TokenPair } from './token.service';
import { TenantModulesService } from '../tenant-modules/tenant-modules.service';
import { ModuleKey } from '../../common/modules-catalog/module-catalog';
import type { RegisterDto } from './dto/register.dto';
import type { LoginDto } from './dto/login.dto';
import type { ChangePasswordDto } from './dto/change-password.dto';

export interface AuthResult {
  user: {
    id: string;
    tenantId: string;
    email: string;
    fullName: string;
    role: string;
    enabledModules: ModuleKey[];
  };
  tokens: TokenPair;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(TENANT_PRISMA) private readonly tenantPrisma: TenantPrismaClient,
    private readonly tokenService: TokenService,
    private readonly tenantModulesService: TenantModulesService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResult> {
    const existingUser = await this.prisma.user.findFirst({
      where: { email: dto.email },
    });
    if (existingUser) {
      throw new ConflictException('Bu e-posta adresiyle zaten bir hesap var');
    }

    const slug = await this.generateUniqueSlug(dto.tenantName);
    const passwordHash = await argon2.hash(dto.password);

    const { tenant, user } = await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: { name: dto.tenantName, slug },
      });
      const user = await tx.user.create({
        data: {
          tenantId: tenant.id,
          email: dto.email,
          passwordHash,
          fullName: dto.fullName,
          role: 'OWNER',
        },
      });
      await this.tenantModulesService.seedDefaultsForNewTenant(tx, tenant.id);
      return { tenant, user };
    });

    const { tokens, enabledModules } = await this.issueAndStoreTokens(
      tenant.id,
      user.id,
      user.role,
      user.email,
    );

    return {
      user: {
        id: user.id,
        tenantId: tenant.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        enabledModules,
      },
      tokens,
    };
  }

  async login(dto: LoginDto): Promise<AuthResult> {
    const user = await this.prisma.user.findFirst({
      where: { email: dto.email },
    });
    const invalidCredentials = () =>
      new UnauthorizedException('E-posta veya şifre hatalı');

    if (!user || !user.isActive) {
      throw invalidCredentials();
    }

    const passwordValid = await argon2.verify(user.passwordHash, dto.password);
    if (!passwordValid) {
      throw invalidCredentials();
    }

    await TenantContext.run({ tenantId: user.tenantId }, async () => {
      await this.tenantPrisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      });
    });

    const { tokens, enabledModules } = await this.issueAndStoreTokens(
      user.tenantId,
      user.id,
      user.role,
      user.email,
    );

    return {
      user: {
        id: user.id,
        tenantId: user.tenantId,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        enabledModules,
      },
      tokens,
    };
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    const invalid = () =>
      new UnauthorizedException('Geçersiz veya süresi dolmuş oturum');

    let payload: { sub: string; tenantId: string };
    try {
      payload = await this.tokenService.verifyRefreshToken(refreshToken);
    } catch {
      throw invalid();
    }

    const tokenHash = this.tokenService.hashToken(refreshToken);

    return TenantContext.run({ tenantId: payload.tenantId }, async () => {
      const stored = await this.tenantPrisma.refreshToken.findFirst({
        where: { userId: payload.sub, tokenHash, revokedAt: null },
      });
      if (!stored || stored.expiresAt < new Date()) {
        throw invalid();
      }

      const user = await this.tenantPrisma.user.findFirst({
        where: { id: payload.sub },
      });
      if (!user || !user.isActive) {
        throw invalid();
      }

      await this.tenantPrisma.refreshToken.update({
        where: { id: stored.id },
        data: { revokedAt: new Date() },
      });

      const { tokens } = await this.issueAndStoreTokens(
        user.tenantId,
        user.id,
        user.role,
        user.email,
      );
      return tokens;
    });
  }

  async logout(
    userId: string,
    tenantId: string,
    refreshToken: string,
  ): Promise<void> {
    const tokenHash = this.tokenService.hashToken(refreshToken);
    await TenantContext.run({ tenantId }, async () => {
      await this.tenantPrisma.refreshToken.updateMany({
        where: { userId, tokenHash, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });
  }

  async changePassword(
    userId: string,
    tenantId: string,
    dto: ChangePasswordDto,
  ): Promise<void> {
    await TenantContext.run({ tenantId }, async () => {
      const user = await this.tenantPrisma.user.findFirst({
        where: { id: userId },
      });
      if (!user) {
        throw new UnauthorizedException('Kimlik doğrulama gerekli');
      }

      const currentValid = await argon2.verify(
        user.passwordHash,
        dto.currentPassword,
      );
      if (!currentValid) {
        throw new UnauthorizedException('Mevcut şifre hatalı');
      }

      const passwordHash = await argon2.hash(dto.newPassword);
      await this.tenantPrisma.user.update({
        where: { id: userId },
        data: { passwordHash },
      });
    });
  }

  private async issueAndStoreTokens(
    tenantId: string,
    userId: string,
    role: Role,
    email: string,
  ): Promise<{ tokens: TokenPair; enabledModules: ModuleKey[] }> {
    const enabledModules = await TenantContext.run({ tenantId }, () =>
      this.tenantModulesService.getEnabledModuleKeys(),
    );

    const tokens = await this.tokenService.issueTokenPair({
      sub: userId,
      tenantId,
      role,
      email,
      enabledModules,
    });

    await TenantContext.run({ tenantId }, async () => {
      // tenantId, tenant-izolasyon uzantısı tarafından çalışma zamanında eklenir
      await this.tenantPrisma.refreshToken.create({
        data: {
          userId,
          tokenHash: this.tokenService.hashToken(tokens.refreshToken),
          expiresAt: tokens.refreshTokenExpiresAt,
        } as never,
      });
    });

    return { tokens, enabledModules };
  }

  private async generateUniqueSlug(tenantName: string): Promise<string> {
    const base = slugify(tenantName) || 'firma';
    let candidate = base;
    let suffix = 1;
    while (
      await this.prisma.tenant.findUnique({ where: { slug: candidate } })
    ) {
      suffix += 1;
      candidate = `${base}-${suffix}`;
    }
    return candidate;
  }
}
