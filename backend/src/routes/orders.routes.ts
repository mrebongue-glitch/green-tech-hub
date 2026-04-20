import { Router, Request, Response, NextFunction } from 'express';
import {
  createOrder,
  listMyOrders,
  getOrder,
  updateOrderStatus,
} from '../controllers/orders.controller';
import { validate } from '../middleware/validate.middleware';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { createOrderSchema, updateOrderStatusSchema, orderQuerySchema } from '../schemas/order.schema';
import { handleWebhook, createPaymentIntent } from '../services/stripe.service';
import { AppError } from '../middleware/errorHandler.middleware';
import { AuthRequest } from '../types';

const router = Router();

// Stripe webhook — body brut, pas d'auth middleware
router.post(
  '/webhook/stripe',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const signature = req.headers['stripe-signature'] as string;
      if (!signature) throw new AppError(400, 'Missing Stripe signature');
      await handleWebhook(req.body as Buffer, signature);
      res.json({ received: true });
    } catch (err) {
      next(err);
    }
  }
);

router.use(authenticate);

router.get('/', validate(orderQuerySchema), listMyOrders);
router.post('/', validate(createOrderSchema), createOrder);
router.get('/:id', getOrder);

// C4 — FIX IDOR : createPaymentIntent reçoit l'userId du token, pas du body
router.post('/:id/pay', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await createPaymentIntent(req.params.id, req.user!.sub);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

router.patch(
  '/:id/status',
  authorize('ADMIN', 'SUPER_ADMIN'),
  validate(updateOrderStatusSchema),
  updateOrderStatus
);

export default router;
