import { Router } from 'express';
import authRoutes from './authRoutes';
import debtRoutes from './debtRoutes';
import paymentRoutes from './paymentRoutes';
import paymentHistoryRoutes from './paymentHistoryRoutes';
import adminRoutes from './adminRoutes';

const router = Router();

router.use('/auth', authRoutes);
router.use('/debts', debtRoutes);
router.use('/payments', paymentRoutes);
router.use('/payment-history', paymentHistoryRoutes);
router.use('/admin', adminRoutes);

export default router;
