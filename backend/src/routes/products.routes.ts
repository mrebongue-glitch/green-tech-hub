import { Router } from 'express';
import {
  listProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
  updateStock,
} from '../controllers/products.controller';
import { validate } from '../middleware/validate.middleware';
import { authenticate, authorize } from '../middleware/auth.middleware';
import {
  createProductSchema,
  updateProductSchema,
  productQuerySchema,
} from '../schemas/product.schema';
import { z } from 'zod';

const router = Router();

// Public endpoints
router.get('/', validate(productQuerySchema), listProducts);
router.get('/:id', getProduct);

// Admin-only endpoints
router.post(
  '/',
  authenticate,
  authorize('ADMIN', 'SUPER_ADMIN'),
  validate(createProductSchema),
  createProduct
);

router.patch(
  '/:id',
  authenticate,
  authorize('ADMIN', 'SUPER_ADMIN'),
  validate(updateProductSchema),
  updateProduct
);

router.delete('/:id', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), deleteProduct);

router.patch(
  '/:id/stock',
  authenticate,
  authorize('ADMIN', 'SUPER_ADMIN'),
  validate(
    z.object({
      params: z.object({ id: z.string().uuid() }),
      body: z.object({
        quantity: z.number().int().positive(),
        type: z.enum(['IN', 'OUT', 'ADJUSTMENT']),
        reason: z.string().max(200).optional(),
      }),
    })
  ),
  updateStock
);

export default router;
