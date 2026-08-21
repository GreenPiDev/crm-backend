import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly transporter: nodemailer.Transporter;

  constructor(private readonly config: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: this.config.get<string>('MAIL_HOST'),
      port: this.config.get<number>('MAIL_PORT'),
      secure: false,
    });
  }

  async sendInvite(params: {
    to: string;
    tenantName: string;
    inviterName: string;
    inviteUrl: string;
  }): Promise<void> {
    await this.transporter.sendMail({
      from: 'Nova CRM <no-reply@nova-crm.local>',
      to: params.to,
      subject: `${params.tenantName} ekibine davet edildiniz`,
      html: `
        <p>Merhaba,</p>
        <p><strong>${params.inviterName}</strong> sizi <strong>${params.tenantName}</strong>
        firmasının Nova CRM hesabına davet etti.</p>
        <p><a href="${params.inviteUrl}">Daveti kabul etmek için tıklayın</a></p>
      `,
    });
  }
}
