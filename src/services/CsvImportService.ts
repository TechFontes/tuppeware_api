import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { StatusCodes } from 'http-status-codes';
import AppError from '../utils/AppError';
import { parseCSV, CONSULTANT_COLUMNS, DEBT_COLUMNS, CLIENT_COLUMNS } from '../utils/csvParser';
import { cleanCPF, isValidCPF } from '../utils/cpfValidator';
import { TIPO_TO_ROLE } from '../utils/constants';
import consultantRepository from '../repositories/ConsultantRepository';
import debtRepository from '../repositories/DebtRepository';
import userRepository from '../repositories/UserRepository';
import type { ImportResult } from '../types';
import type { UserRole } from '../../generated/prisma/client';

interface ConsultantRecord {
  codigo: string;
  tipo: string;
  grupo: string;
  distrito: string;
  cpf: string;
}

interface DebtRecord {
  codigo: string;
  nome: string;
  grupo: string;
  distrito: string;
  semana: string;
  valor: string;
  data_vencimento: string;
  numero_nf: string;
  status?: string;
}

interface ClientRecord {
  codigo: string;
  name: string;
  cpf: string;
  email: string;
  role: string;
  grupo: string;
  distrito: string;
}

const ROLE_MAP: Record<string, UserRole> = {
  EMPRESARIA: 'EMPRESARIA',
  LIDER: 'LIDER',
  CONSULTOR: 'CONSULTOR',
};

const ROLE_TO_TIPO: Record<string, number> = {
  EMPRESARIA: 1,
  LIDER: 2,
  CONSULTOR: 3,
};

class CsvImportService {
  /**
   * Importa consultores a partir de arquivo CSV.
   * Formato: codigo;tipo;grupo;distrito;CPF
   */
  async importConsultants(fileBuffer: Buffer): Promise<ImportResult> {
    const records = await parseCSV<ConsultantRecord>(fileBuffer, CONSULTANT_COLUMNS);

    if (records.length === 0) {
      throw new AppError('Arquivo CSV vazio.', StatusCodes.BAD_REQUEST);
    }

    const results: { success: number; errors: Array<{ line: number; message: string }> } = { success: 0, errors: [] };

    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      const line = i + 1;

      try {
        // Validações
        if (!record.codigo || !record.tipo || !record.grupo || !record.distrito || !record.cpf) {
          results.errors.push({ line, message: 'Campos obrigatórios ausentes.' });
          continue;
        }

        const tipo = parseInt(record.tipo);

        if (![1, 2, 3].includes(tipo)) {
          results.errors.push({ line, message: `Tipo inválido: ${record.tipo}. Use 1, 2 ou 3.` });
          continue;
        }

        const cpf = cleanCPF(record.cpf);

        if (!isValidCPF(cpf)) {
          results.errors.push({ line, message: `CPF inválido: ${record.cpf}` });
          continue;
        }

        // Upsert do consultor
        const consultant = await consultantRepository.upsertByCpf({
          codigo: record.codigo.trim(),
          tipo,
          grupo: record.grupo.trim(),
          distrito: record.distrito.trim(),
          cpf,
        });

        // Se existe usuário com este CPF, vincula e atualiza role
        if (!consultant.userId) {
          const user = await userRepository.findByCpf(cpf);

          if (user) {
            await consultantRepository.linkToUser(consultant.id, user.id);

            await userRepository.update(user.id, { role: (TIPO_TO_ROLE[tipo] || 'CONSULTOR') as 'EMPRESARIA' | 'LIDER' | 'CONSULTOR' });
          }
        } else {
          // Atualiza role caso o tipo tenha mudado
          await userRepository.update(consultant.userId, { role: (TIPO_TO_ROLE[tipo] || 'CONSULTOR') as 'EMPRESARIA' | 'LIDER' | 'CONSULTOR' });
        }

        results.success++;
      } catch (error) {
        results.errors.push({ line, message: (error as Error).message });
      }
    }

    return {
      total: records.length,
      success: results.success,
      errors: results.errors,
    };
  }

  /**
   * Importa débitos a partir de arquivo CSV (formato v2).
   * Formato: codigo;nome;grupo;distrito;semana;valor;dataVencimento;numeroNf;status
   * diasAtraso é calculado automaticamente a partir de dataVencimento.
   */
  async importDebts(fileBuffer: Buffer): Promise<ImportResult> {
    const records = await parseCSV<DebtRecord>(fileBuffer, DEBT_COLUMNS);

    if (records.length === 0) {
      throw new AppError('Arquivo CSV vazio.', StatusCodes.BAD_REQUEST);
    }

    const results: { success: number; errors: Array<{ line: number; message: string }> } = { success: 0, errors: [] };
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      const line = i + 1;

      try {
        if (!record.codigo || !record.nome || !record.valor || !record.numero_nf) {
          results.errors.push({ line, message: 'Campos obrigatórios ausentes.' });
          continue;
        }

        const valor = parseFloat(record.valor.replace(',', '.'));

        if (isNaN(valor) || valor <= 0) {
          results.errors.push({ line, message: `Valor inválido: ${record.valor}` });
          continue;
        }

        let dataVencimento: Date;

        try {
          dataVencimento = new Date(record.data_vencimento);

          if (isNaN(dataVencimento.getTime())) {
            throw new Error('Data inválida');
          }
        } catch (_) {
          results.errors.push({ line, message: `Data de vencimento inválida: ${record.data_vencimento}` });
          continue;
        }

        // Calcula dias de atraso automaticamente
        const diffMs = today.getTime() - dataVencimento.getTime();
        const diasAtraso = Math.max(0, Math.floor(diffMs / 86_400_000));

        // Usa status do CSV se fornecido e válido, caso contrário calcula
        const validStatuses = ['PENDENTE', 'ATRASADO', 'PAGO'];
        let status: 'PENDENTE' | 'ATRASADO' | 'PAGO';

        if (record.status && validStatuses.includes(record.status.trim().toUpperCase())) {
          status = record.status.trim().toUpperCase() as 'PENDENTE' | 'ATRASADO' | 'PAGO';
        } else {
          status = diasAtraso > 0 ? 'ATRASADO' : 'PENDENTE';
        }

        await debtRepository.upsertByNf({
          codigo: record.codigo.trim(),
          nome: record.nome.trim(),
          grupo: record.grupo ? record.grupo.trim() : '',
          distrito: record.distrito ? record.distrito.trim() : '',
          semana: record.semana ? record.semana.trim() : '',
          valor,
          diasAtraso,
          dataVencimento,
          numeroNf: record.numero_nf.trim(),
          status,
        });

        results.success++;
      } catch (error) {
        results.errors.push({ line, message: (error as Error).message });
      }
    }

    return {
      total: records.length,
      success: results.success,
      errors: results.errors,
    };
  }

  /**
   * Importa clientes a partir de arquivo CSV (formato v2).
   * Formato: codigo;name;cpf;email;role;grupo;distrito
   * Se CPF já existe: atualiza grupo/distrito do Consultant vinculado.
   * Se CPF não existe: cria User + Consultant. Senha inicial = CPF.
   */
  async importClients(fileBuffer: Buffer): Promise<ImportResult> {
    const records = await parseCSV<ClientRecord>(fileBuffer, CLIENT_COLUMNS);

    if (records.length === 0) {
      throw new AppError('Arquivo CSV vazio.', StatusCodes.BAD_REQUEST);
    }

    const results: { success: number; errors: Array<{ line: number; message: string }> } = { success: 0, errors: [] };

    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      const line = i + 1;

      try {
        if (!record.codigo || !record.name || !record.cpf || !record.email || !record.role) {
          results.errors.push({ line, message: 'Campos obrigatórios ausentes.' });
          continue;
        }

        const cpf = cleanCPF(record.cpf);

        if (!isValidCPF(cpf)) {
          results.errors.push({ line, message: `CPF inválido: ${record.cpf}` });
          continue;
        }

        const roleUpper = record.role.trim().toUpperCase();
        const role = ROLE_MAP[roleUpper];

        if (!role) {
          results.errors.push({ line, message: `Role inválida: ${record.role}. Use EMPRESARIA, LIDER ou CONSULTOR.` });
          continue;
        }

        const tipo = ROLE_TO_TIPO[roleUpper];
        const existingUser = await userRepository.findByCpf(cpf);

        if (existingUser) {
          // Atualiza grupo e distrito do consultant vinculado
          if (existingUser.consultant) {
            await consultantRepository.upsertByCpf({
              codigo: record.codigo.trim(),
              tipo,
              grupo: record.grupo ? record.grupo.trim() : existingUser.consultant.grupo,
              distrito: record.distrito ? record.distrito.trim() : existingUser.consultant.distrito,
              cpf,
            });
          }
        } else {
          // Cria usuário com senha inicial aleatória (nunca CPF)
          const randomPassword = crypto.randomBytes(16).toString('hex');
          const hashedPassword = await bcrypt.hash(randomPassword, 10);
          const user = await userRepository.create({
            name: record.name.trim(),
            cpf,
            email: record.email.trim().toLowerCase(),
            password: hashedPassword,
            role,
          });

          await consultantRepository.upsertByCpf({
            codigo: record.codigo.trim(),
            tipo,
            grupo: record.grupo ? record.grupo.trim() : '',
            distrito: record.distrito ? record.distrito.trim() : '',
            cpf,
          });

          // Vincula consultant ao user recém criado
          const consultant = await consultantRepository.findByCpf(cpf);

          if (consultant && !consultant.userId) {
            await consultantRepository.linkToUser(consultant.id, user.id);
          }
        }

        results.success++;
      } catch (error) {
        results.errors.push({ line, message: (error as Error).message });
      }
    }

    return {
      total: records.length,
      success: results.success,
      errors: results.errors,
    };
  }
}

export default new CsvImportService();
