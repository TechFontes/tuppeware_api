import { parse } from 'csv-parse';

/**
 * Faz o parse de um conteúdo CSV com delimitador ponto-e-vírgula.
 * @param content - Conteúdo do arquivo CSV
 * @param columns - Nomes das colunas esperadas
 * @returns Array de objetos com os dados do CSV
 */
const parseCSV = <T>(
  content: Buffer | string,
  columns: string[],
): Promise<T[]> => {
  return new Promise((resolve, reject) => {
    const records: T[] = [];

    const parser = parse(content, {
      delimiter: ';',
      columns,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
    });

    parser.on('readable', () => {
      let record: T | null;

      while ((record = parser.read() as T | null) !== null) {
        records.push(record);
      }
    });

    parser.on('error', (err: Error) => {
      reject(err);
    });

    parser.on('end', () => {
      resolve(records);
    });
  });
};

/**
 * Colunas esperadas para importação de consultores.
 * Formato: codigo;tipo;grupo;distrito;CPF
 */
const CONSULTANT_COLUMNS = ['codigo', 'tipo', 'grupo', 'distrito', 'cpf'];

/**
 * Colunas esperadas para importação de débitos (v2).
 * Formato: codigo;nome;grupo;distrito;semana;valor;dataVencimento;numeroNf;status
 * - dias_atraso removido: calculado automaticamente a partir de dataVencimento
 * - status adicionado: PENDENTE | ATRASADO | PAGO
 * - upsert por numeroNf (chave única)
 */
const DEBT_COLUMNS = [
  'codigo',
  'nome',
  'grupo',
  'distrito',
  'semana',
  'valor',
  'data_vencimento',
  'numero_nf',
  'status',
];

/**
 * Colunas esperadas para importação de clientes (v2).
 * Formato: USER;name;cpf;email;role;grupo;distrito
 */
const CLIENT_COLUMNS = ['codigo', 'name', 'cpf', 'email', 'role', 'grupo', 'distrito'];

export { parseCSV, CONSULTANT_COLUMNS, DEBT_COLUMNS, CLIENT_COLUMNS };
