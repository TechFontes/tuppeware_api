import { Request, Response, NextFunction } from 'express';
import { StatusCodes } from 'http-status-codes';
import bcrypt from 'bcryptjs';
import csvImportService from '../services/CsvImportService';
import userService from '../services/UserService';
import debtService from '../services/DebtService';
import paymentService from '../services/PaymentService';
import settingsService from '../services/SettingsService';
import type { UserRole, Prisma } from '../../generated/prisma/client';

function getPagination(query: Record<string, unknown>) {
  const page = Math.max(1, parseInt(String(query.page || '1')));
  const limit = Math.min(100, Math.max(1, parseInt(String(query.limit || '20'))));
  const skip = (page - 1) * limit;

  return { page, limit, skip };
}

class AdminController {
  // -----------------------------------------------------------------------
  // CSV Imports
  // -----------------------------------------------------------------------

  async importConsultants(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await csvImportService.importConsultants(req.file!.buffer);

      res.status(StatusCodes.OK).json({
        status: 'success',
        message: `Importação concluída: ${result.success} de ${result.total} registros importados.`,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  async importDebts(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await csvImportService.importDebts(req.file!.buffer);

      res.status(StatusCodes.OK).json({
        status: 'success',
        message: `Importação concluída: ${result.success} de ${result.total} registros importados.`,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/admin/import/clients
   */
  async importClients(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await csvImportService.importClients(req.file!.buffer);

      res.status(StatusCodes.OK).json({
        status: 'success',
        message: `Importação concluída: ${result.success} de ${result.total} registros importados.`,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  // -----------------------------------------------------------------------
  // User Management
  // -----------------------------------------------------------------------

  /**
   * GET /api/admin/users
   */
  async listUsers(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const pagination = getPagination(req.query as Record<string, unknown>);
      const { role, grupo, distrito, isActive } = req.query as Record<string, string>;

      const result = await userService.listUsers({
        role: role as UserRole | undefined,
        grupo,
        distrito,
        isActive: isActive !== undefined ? isActive === 'true' : undefined,
        pagination,
      });

      res.status(StatusCodes.OK).json({ status: 'success', ...result });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/admin/users/:id
   */
  async getUser(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = await userService.findById(String(req.params.id));

      res.status(StatusCodes.OK).json({ status: 'success', data: user });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /api/admin/users/:id
   */
  async updateUser(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const allowedFields = ['name', 'email', 'role', 'isActive', 'phone', 'birthDate',
        'address', 'addressNumber', 'addressComplement', 'neighbourhood', 'city', 'state', 'postalCode'];
      const body = req.body as Record<string, unknown>;
      const updateData: Record<string, unknown> = {};

      for (const field of allowedFields) {
        if (body[field] !== undefined) {
          updateData[field] = body[field];
        }
      }

      // Se newPassword fornecido, hasheia antes de salvar
      if (body.newPassword && typeof body.newPassword === 'string') {
        updateData.password = await bcrypt.hash(body.newPassword, 10);
      }

      const user = await userService.update(String(req.params.id), updateData as Prisma.UserUpdateInput);

      res.status(StatusCodes.OK).json({ status: 'success', data: user });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/admin/users/:id/deactivate
   */
  async deactivateUser(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = await userService.deactivateUser(String(req.params.id));

      res.status(StatusCodes.OK).json({ status: 'success', data: user });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/admin/users/:id/payments
   */
  async getUserPayments(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const pagination = getPagination(req.query as Record<string, unknown>);
      const result = await userService.getUserPayments(String(req.params.id), pagination);

      res.status(StatusCodes.OK).json({ status: 'success', data: result.data, pagination: {
        total: result.total,
        page: pagination.page,
        limit: pagination.limit,
        totalPages: Math.ceil(result.total / pagination.limit),
        hasNextPage: pagination.skip + pagination.limit < result.total,
        hasPreviousPage: pagination.page > 1,
      } });
    } catch (error) {
      next(error);
    }
  }

  // -----------------------------------------------------------------------
  // GERENTE: Manager Management
  // -----------------------------------------------------------------------

  /**
   * POST /api/admin/managers
   */
  async createManager(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { name, cpf, email, password } = req.body as Record<string, string>;
      const manager = await userService.createAdmin({ name, cpf, email, password });

      res.status(StatusCodes.CREATED).json({ status: 'success', data: manager });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/admin/managers
   */
  async listManagers(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const pagination = getPagination(req.query as Record<string, unknown>);
      const result = await userService.listAdmins(pagination);

      res.status(StatusCodes.OK).json({ status: 'success', ...result });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /api/admin/managers/:id
   */
  async updateManager(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { name, email } = req.body as { name?: string; email?: string };
      const manager = await userService.updateAdmin(String(req.params.id), { name, email });

      res.status(StatusCodes.OK).json({ status: 'success', data: manager });
    } catch (error) {
      next(error);
    }
  }

  // -----------------------------------------------------------------------
  // GERENTE: Settings
  // -----------------------------------------------------------------------

  /**
   * GET /api/admin/settings
   */
  async getSettings(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const settings = await settingsService.getAll();

      res.status(StatusCodes.OK).json({ status: 'success', data: settings });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /api/admin/settings
   */
  async updateSettings(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const settings = await settingsService.setMany(req.body as Record<string, string>);

      res.status(StatusCodes.OK).json({ status: 'success', data: settings });
    } catch (error) {
      next(error);
    }
  }

  // -----------------------------------------------------------------------
  // Debts
  // -----------------------------------------------------------------------

  /**
   * POST /api/admin/debts
   */
  async createDebt(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { codigo, nome, grupo, distrito, semana, valor, dataVencimento, numeroNf, status } =
        req.body as Record<string, string>;

      const debt = await debtService.adminCreateDebt({
        codigo,
        nome,
        grupo: grupo || '',
        distrito: distrito || '',
        semana: semana || '',
        valor: parseFloat(valor),
        dataVencimento: new Date(dataVencimento),
        numeroNf,
        status: (status || 'PENDENTE') as 'PENDENTE' | 'ATRASADO' | 'PAGO',
      });

      res.status(StatusCodes.CREATED).json({ status: 'success', data: debt });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/admin/debts/:id/status
   */
  async updateDebtStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { status } = req.body as { status: 'PENDENTE' | 'ATRASADO' | 'PAGO' };
      const debt = await debtService.adminUpdateDebtStatus(String(req.params.id), status);

      res.status(StatusCodes.OK).json({ status: 'success', data: debt });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/admin/debts/weekly
   */
  async getWeeklyDebts(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { semana } = req.query as { semana?: string };
      const { data, total } = await debtService.listByWeek(semana);

      res.status(StatusCodes.OK).json({ status: 'success', data, total });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/admin/debts/paid-today
   */
  async getPaidTodayDebts(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { data, total } = await debtService.listPaidToday();

      res.status(StatusCodes.OK).json({ status: 'success', data, total });
    } catch (error) {
      next(error);
    }
  }

  // -----------------------------------------------------------------------
  // Clients (Consultores)
  // -----------------------------------------------------------------------

  /**
   * GET /api/admin/clients
   */
  async listClients(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const pagination = getPagination(req.query as Record<string, unknown>);
      const { grupo, distrito } = req.query as Record<string, string>;

      const result = await userService.listUsers({
        role: undefined,
        grupo,
        distrito,
        isActive: true,
        pagination,
      });

      res.status(StatusCodes.OK).json({ status: 'success', ...result });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/admin/clients/:id
   */
  async updateClient(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { grupo, distrito } = req.body as { grupo?: string; distrito?: string };
      const updated = await userService.updateClientConsultant(String(req.params.id), { grupo, distrito });

      res.status(StatusCodes.OK).json({ status: 'success', data: updated });
    } catch (error) {
      next(error);
    }
  }

  // -----------------------------------------------------------------------
  // Organization
  // -----------------------------------------------------------------------

  /**
   * GET /api/admin/organization
   */
  async getOrganization(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { grupo, distrito } = req.query as Record<string, string>;
      const consultants = await userService.getOrganization({ grupo, distrito });

      res.status(StatusCodes.OK).json({ status: 'success', data: consultants });
    } catch (error) {
      next(error);
    }
  }

  // -----------------------------------------------------------------------
  // Reports
  // -----------------------------------------------------------------------

  /**
   * GET /api/admin/reports/paid-documents
   */
  async getPaidDocuments(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const pagination = getPagination(req.query as Record<string, unknown>);
      const { dataInicio, dataFim } = req.query as Record<string, string>;

      const { data, total } = await paymentService.listPaidDocuments({
        dataInicio,
        dataFim,
        page: pagination.page,
        limit: pagination.limit,
        skip: pagination.skip,
      });

      res.status(StatusCodes.OK).json({
        status: 'success',
        data,
        pagination: {
          total,
          page: pagination.page,
          limit: pagination.limit,
          totalPages: Math.ceil(total / pagination.limit),
          hasNextPage: pagination.skip + pagination.limit < total,
          hasPreviousPage: pagination.page > 1,
        },
      });
    } catch (error) {
      next(error);
    }
  }
}

export default new AdminController();
