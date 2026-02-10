import { StatusCodes } from 'http-status-codes';
import AppError from '../utils/AppError';
import { parseCSV, CONSULTANT_COLUMNS, DEBT_COLUMNS } from '../utils/csvParser';
import { cleanCPF, isValidCPF } from '../utils/cpfValidator';
import consultantRepository from '../repositories/ConsultantRepository';
import debtRepository from '../repositories/DebtRepository';
import userRepository from '../repositories/UserRepository';
import type { ImportResult } from '../types';

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
  dias_atraso: string;
  data_vencimento: string;
  numero_nf: string;
}

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

            const roleMap: Record<number, string> = { 1: 'EMPRESARIA', 2: 'LIDER', 3: 'CONSULTOR' };

            await userRepository.update(user.id, { role: (roleMap[tipo] || 'CONSULTOR') as 'EMPRESARIA' | 'LIDER' | 'CONSULTOR' });
          }
        } else {
          // Atualiza role caso o tipo tenha mudado
          const roleMap: Record<number, string> = { 1: 'EMPRESARIA', 2: 'LIDER', 3: 'CONSULTOR' };

          await userRepository.update(consultant.userId, { role: (roleMap[tipo] || 'CONSULTOR') as 'EMPRESARIA' | 'LIDER' | 'CONSULTOR' });
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
   * Importa débitos a partir de arquivo CSV.
   * Formato: codigo;nome;grupo;distrito;semana;valor;dias_atraso;data_vencimento;numero_nf
   */
  async importDebts(fileBuffer: Buffer): Promise<ImportResult> {
    const records = await parseCSV<DebtRecord>(fileBuffer, DEBT_COLUMNS);

    if (records.length === 0) {
      throw new AppError('Arquivo CSV vazio.', StatusCodes.BAD_REQUEST);
    }

    const results: { success: number; errors: Array<{ line: number; message: string }> } = { success: 0, errors: [] };

    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      const line = i + 1;

      try {
        // Validações
        if (!record.codigo || !record.nome || !record.valor || !record.numero_nf) {
          results.errors.push({ line, message: 'Campos obrigatórios ausentes.' });
          continue;
        }

        const valor = parseFloat(record.valor.replace(',', '.'));

        if (isNaN(valor) || valor <= 0) {
          results.errors.push({ line, message: `Valor inválido: ${record.valor}` });
          continue;
        }

        const diasAtraso = parseInt(record.dias_atraso) || 0;

        // Determina status automático
        let status: 'PENDENTE' | 'ATRASADO' = 'PENDENTE';

        if (diasAtraso > 0) {
          status = 'ATRASADO';
        }

        // Parse da data de vencimento
        let dataVencimento: Date;

        try {
          dataVencimento = new Date(record.data_vencimento);

          if (isNaN(dataVencimento.getTime())) {
            throw new Error('Data inválida');
          }
        } catch (_) {
          results.errors.push({
            line,
            message: `Data de vencimento inválida: ${record.data_vencimento}`,
          });
          continue;
        }

        await debtRepository.create({
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
}

export default new CsvImportService();
