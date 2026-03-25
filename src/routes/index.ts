import { Router } from 'express';
import authRoutes from './authRoutes';
import debtRoutes from './debtRoutes';
import paymentRoutes from './paymentRoutes';
import paymentHistoryRoutes from './paymentHistoryRoutes';
import adminRoutes from './adminRoutes';
import userRoutes from './userRoutes';

const router = Router();

router.use('/auth', authRoutes);
router.use('/debts', debtRoutes);
router.use('/payments', paymentRoutes);
router.use('/payment-history', paymentHistoryRoutes);
router.use('/admin', adminRoutes);
router.use('/users', userRoutes);

export default router;
