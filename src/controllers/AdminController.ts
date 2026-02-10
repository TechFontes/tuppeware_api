import { Request, Response, NextFunction } from 'express';
import { StatusCodes } from 'http-status-codes';
import csvImportService from '../services/CsvImportService';

class AdminController {
  /**
   * POST /api/admin/import/consultants
   * Importa consultores via arquivo CSV.
   */
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

  /**
   * POST /api/admin/import/debts
   * Importa débitos via arquivo CSV.
   */
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
}

export default new AdminController();
