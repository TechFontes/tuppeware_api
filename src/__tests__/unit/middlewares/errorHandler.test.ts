import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StatusCodes } from 'http-status-codes';
import { errorHandler } from '../../../middlewares/errorHandler';
import AppError from '../../../utils/AppError';

const makeRes = () => {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
};

const makeReq = () => ({} as any);
const makeNext = () => vi.fn();

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.NODE_ENV;
});

describe('errorHandler — AppError', () => {
  it('retorna status e mensagem do AppError (4xx → status: fail)', () => {
    const err = new AppError('Não encontrado.', StatusCodes.NOT_FOUND);
    const res = makeRes();

    errorHandler(err, makeReq(), res, makeNext());

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      status: 'fail',
      message: 'Não encontrado.',
    });
  });

  it('retorna status: error para 5xx AppError', () => {
    const err = new AppError('Falha interna.', StatusCodes.INTERNAL_SERVER_ERROR);
    const res = makeRes();

    errorHandler(err, makeReq(), res, makeNext());

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      status: 'error',
      message: 'Falha interna.',
    });
  });

  it('inclui details quando presente no AppError', () => {
    const details = [{ field: 'email', message: 'inválido' }];
    const err = new AppError('Validação falhou.', StatusCodes.BAD_REQUEST, details);
    const res = makeRes();

    errorHandler(err, makeReq(), res, makeNext());

    expect(res.json).toHaveBeenCalledWith({
      status: 'fail',
      message: 'Validação falhou.',
      details,
    });
  });

  it('não inclui details quando null', () => {
    const err = new AppError('Erro.', StatusCodes.BAD_REQUEST);
    const res = makeRes();

    errorHandler(err, makeReq(), res, makeNext());

    const body = res.json.mock.calls[0][0];
    expect(body.details).toBeUndefined();
  });
});

describe('errorHandler — Prisma errors', () => {
  it('retorna 409 para P2002 (unique constraint) com campo', () => {
    const err = new Error('Unique constraint') as any;
    err.code = 'P2002';
    err.meta = { target: ['email'] };
    const res = makeRes();

    errorHandler(err, makeReq(), res, makeNext());

    expect(res.status).toHaveBeenCalledWith(StatusCodes.CONFLICT);
    expect(res.json).toHaveBeenCalledWith({
      status: 'fail',
      message: 'Já existe um registro com este email.',
    });
  });

  it('retorna 409 para P2002 com fallback "campo" quando target ausente', () => {
    const err = new Error('Unique constraint') as any;
    err.code = 'P2002';
    err.meta = {};
    const res = makeRes();

    errorHandler(err, makeReq(), res, makeNext());

    expect(res.json).toHaveBeenCalledWith({
      status: 'fail',
      message: 'Já existe um registro com este campo.',
    });
  });

  it('retorna 404 para P2025 (record not found)', () => {
    const err = new Error('Record not found') as any;
    err.code = 'P2025';
    const res = makeRes();

    errorHandler(err, makeReq(), res, makeNext());

    expect(res.status).toHaveBeenCalledWith(StatusCodes.NOT_FOUND);
    expect(res.json).toHaveBeenCalledWith({
      status: 'fail',
      message: 'Registro não encontrado.',
    });
  });
});

describe('errorHandler — Parse/Multer errors', () => {
  it('retorna 400 para entity.parse.failed (JSON inválido)', () => {
    const err = new Error('Parse error') as any;
    err.type = 'entity.parse.failed';
    const res = makeRes();

    errorHandler(err, makeReq(), res, makeNext());

    expect(res.status).toHaveBeenCalledWith(StatusCodes.BAD_REQUEST);
    expect(res.json).toHaveBeenCalledWith({
      status: 'fail',
      message: 'JSON inválido no corpo da requisição.',
    });
  });

  it('retorna 400 para LIMIT_FILE_SIZE (arquivo grande demais)', () => {
    const err = new Error('File too large') as any;
    err.code = 'LIMIT_FILE_SIZE';
    const res = makeRes();

    errorHandler(err, makeReq(), res, makeNext());

    expect(res.status).toHaveBeenCalledWith(StatusCodes.BAD_REQUEST);
    expect(res.json).toHaveBeenCalledWith({
      status: 'fail',
      message: 'Arquivo excede o tamanho máximo permitido.',
    });
  });
});

describe('errorHandler — erro genérico', () => {
  it('retorna 500 com mensagem genérica para erro desconhecido', () => {
    const err = new Error('Something broke');
    const res = makeRes();

    errorHandler(err, makeReq(), res, makeNext());

    expect(res.status).toHaveBeenCalledWith(StatusCodes.INTERNAL_SERVER_ERROR);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      status: 'error',
      message: 'Erro interno do servidor.',
    }));
  });

  it('loga o erro no console', () => {
    const err = new Error('Unhandled');
    const res = makeRes();

    errorHandler(err, makeReq(), res, makeNext());

    expect(console.error).toHaveBeenCalledWith('Erro não tratado:', err);
  });

  it('inclui error e stack em development', () => {
    process.env.NODE_ENV = 'development';
    const err = new Error('Dev error');
    const res = makeRes();

    errorHandler(err, makeReq(), res, makeNext());

    const body = res.json.mock.calls[0][0];
    expect(body.error).toBe('Dev error');
    expect(body.stack).toBeDefined();
  });

  it('não inclui error e stack em production', () => {
    process.env.NODE_ENV = 'production';
    const err = new Error('Prod error');
    const res = makeRes();

    errorHandler(err, makeReq(), res, makeNext());

    const body = res.json.mock.calls[0][0];
    expect(body.error).toBeUndefined();
    expect(body.stack).toBeUndefined();
  });
});
