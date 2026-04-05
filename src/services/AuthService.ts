import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { StatusCodes } from 'http-status-codes';

import AppError from '../utils/AppError';
import { cleanCPF, isValidCPF } from '../utils/cpfValidator';
import { jwtSecret, jwtExpiresIn } from '../config/auth';
import { TIPO_TO_ROLE } from '../utils/constants';
import userRepository from '../repositories/UserRepository';
import consultantRepository from '../repositories/ConsultantRepository';
import passwordResetRepository from '../repositories/PasswordResetRepository';
import emailService from './EmailService';
import type { User, RegisterDTO, LoginDTO } from '../types';

class AuthService {
  /**
   * Registra um novo usuário.
   */
  async register({ name, cpf, email, password }: RegisterDTO) {
    const cleanedCpf = cleanCPF(cpf);

    if (!isValidCPF(cleanedCpf)) {
      throw new AppError('CPF inválido.', StatusCodes.BAD_REQUEST);
    }

    // Verifica se e-mail já existe
    const existingEmail = await userRepository.findByEmail(email);

    if (existingEmail) {
      throw new AppError('E-mail já cadastrado.', StatusCodes.CONFLICT);
    }

    // Verifica se CPF já existe
    const existingCpf = await userRepository.findByCpf(cleanedCpf);

    if (existingCpf) {
      throw new AppError('CPF já cadastrado.', StatusCodes.CONFLICT);
    }

    // Hash da senha
    const hashedPassword = await bcrypt.hash(password, 10);

    // Cria o usuário
    const user = await userRepository.create({
      name,
      cpf: cleanedCpf,
      email,
      password: hashedPassword,
    });

    // Verifica se existe consultor com este CPF e vincula
    const consultant = await consultantRepository.findByCpf(cleanedCpf);

    if (consultant) {
      await consultantRepository.linkToUser(consultant.id, user.id);

      // Atualiza a role do usuário baseado no tipo do consultor
      const role = TIPO_TO_ROLE[consultant.tipo] || 'CONSULTOR';

      await userRepository.update(user.id, { role: role as User['role'] });
      user.role = role as User['role'];
    }

    const token = this._generateToken(user);

    return {
      user: this._sanitizeUser(user),
      token,
    };
  }

  /**
   * Realiza o login do usuário.
   */
  async login({ email, password }: LoginDTO) {
    const user = await userRepository.findByEmail(email);

    if (!user) {
      throw new AppError('E-mail ou senha incorretos.', StatusCodes.UNAUTHORIZED);
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      throw new AppError('E-mail ou senha incorretos.', StatusCodes.UNAUTHORIZED);
    }

    if (!user.isActive) {
      throw new AppError('Conta inativa. Entre em contato com o suporte.', StatusCodes.FORBIDDEN);
    }

    const token = this._generateToken(user);

    return {
      user: this._sanitizeUser(user),
      token,
    };
  }

  /**
   * Solicita recuperação de senha.
   */
  async forgotPassword(email: string) {
    const user = await userRepository.findByEmail(email);

    if (!user) {
      // Não revelar se o e-mail existe
      return { message: 'Se o e-mail estiver cadastrado, você receberá um link de recuperação.' };
    }

    // Invalida tokens anteriores
    await passwordResetRepository.invalidateAllForUser(user.id);

    // Gera novo token
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hora

    await passwordResetRepository.create({
      userId: user.id,
      token,
      expiresAt,
    });

    // Envia e-mail
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${token}`;

    await emailService.sendPasswordResetEmail(user.email, user.name, resetUrl);

    return { message: 'Se o e-mail estiver cadastrado, você receberá um link de recuperação.' };
  }

  /**
   * Redefine a senha do usuário.
   */
  async resetPassword(token: string, newPassword: string) {
    const resetRecord = await passwordResetRepository.findByToken(token);

    if (!resetRecord) {
      throw new AppError('Token inválido ou expirado.', StatusCodes.BAD_REQUEST);
    }

    if (resetRecord.used) {
      throw new AppError('Este token já foi utilizado.', StatusCodes.BAD_REQUEST);
    }

    if (new Date() > resetRecord.expiresAt) {
      throw new AppError('Token expirado.', StatusCodes.BAD_REQUEST);
    }

    // Atualiza a senha
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await userRepository.update(resetRecord.userId, { password: hashedPassword });

    // Marca token como usado
    await passwordResetRepository.markAsUsed(resetRecord.id);

    return { message: 'Senha redefinida com sucesso.' };
  }

  /**
   * Gera um token JWT.
   */
  private _generateToken(user: User): string {
    return jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role,
      },
      jwtSecret,
      { expiresIn: jwtExpiresIn as jwt.SignOptions['expiresIn'] },
    );
  }

  /**
   * Remove dados sensíveis do objeto de usuário.
   */
  private _sanitizeUser(user: User): Omit<User, 'password'> {
    const { password: _, ...sanitized } = user;

    return sanitized;
  }
}

export default new AuthService();
