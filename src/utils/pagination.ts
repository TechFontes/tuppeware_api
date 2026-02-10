import { PaginationParams, PaginatedResponse } from '../types';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;

/**
 * Extrai e valida parâmetros de paginação da query string.
 * @param query - Objeto query da request
 * @returns Parâmetros de paginação { page, limit, skip }
 */
const getPaginationParams = (query: Record<string, string | undefined>): PaginationParams => {
  const page = Math.max(parseInt(query.page || '') || DEFAULT_PAGE, 1);
  const limit = Math.min(Math.max(parseInt(query.limit || '') || DEFAULT_LIMIT, 1), 100);
  const skip = (page - 1) * limit;

  return { page, limit, skip };
};

/**
 * Monta o objeto de resposta paginada.
 * @param data - Dados da página atual
 * @param total - Total de registros
 * @param page - Página atual
 * @param limit - Limite por página
 * @returns Objeto com dados paginados e metadados
 */
const paginatedResponse = <T>(data: T[], total: number, page: number, limit: number): PaginatedResponse<T> => {
  const totalPages = Math.ceil(total / limit);

  return {
    data,
    pagination: {
      total,
      page,
      limit,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    },
  };
};

export { getPaginationParams, paginatedResponse };
