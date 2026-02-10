import nodemailer, { type Transporter } from 'nodemailer';

class EmailService {
  private transporter: Transporter | null;

  constructor() {
    this.transporter = null;
  }

  /**
   * Inicializa o transporter do nodemailer (lazy initialization).
   */
  private _getTransporter(): Transporter {
    if (!this.transporter) {
      this.transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '') || 587,
        secure: false,
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });
    }

    return this.transporter;
  }

  /**
   * Envia e-mail de recuperação de senha.
   */
  async sendPasswordResetEmail(to: string, name: string, resetUrl: string): Promise<void> {
    const transporter = this._getTransporter();

    const mailOptions = {
      from: process.env.SMTP_FROM || '"Portal Tuppeware" <noreply@tuppeware.com>',
      to,
      subject: 'Recuperação de Senha - Portal de Gestão',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Recuperação de Senha</h2>
          <p>Olá, <strong>${name}</strong>!</p>
          <p>Recebemos uma solicitação para redefinir sua senha.</p>
          <p>Clique no botão abaixo para criar uma nova senha:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetUrl}" 
               style="background-color: #6C63FF; color: white; padding: 12px 30px; 
                      text-decoration: none; border-radius: 5px; font-weight: bold;">
              Redefinir Senha
            </a>
          </div>
          <p style="color: #666; font-size: 14px;">
            Este link é válido por 1 hora. Se você não solicitou a recuperação de senha, ignore este e-mail.
          </p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
          <p style="color: #999; font-size: 12px;">
            Portal de Gestão de Débitos e Pagamentos
          </p>
        </div>
      `,
    };

    try {
      await transporter.sendMail(mailOptions);
      console.info(`E-mail de recuperação enviado para: ${to}`);
    } catch (error) {
      console.error('Erro ao enviar e-mail:', (error as Error).message);
      // Não lançar erro para não revelar problemas de e-mail ao usuário
    }
  }
}

export default new EmailService();
