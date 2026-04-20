import { Router, Response, NextFunction } from 'express';
import { prisma } from '../config/prisma';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { AuthRequest } from '../types';

const router = Router();

router.use(authenticate, authorize('ADMIN', 'SUPER_ADMIN'));

router.get('/stats', async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const [totalProducts, totalOrders, totalUsers, activeSubscriptions, revenueResult] =
      await Promise.all([
        prisma.product.count({ where: { isActive: true } }),
        prisma.order.count(),
        prisma.user.count(),
        prisma.subscription.count({ where: { status: 'ACTIVE' } }),
        prisma.order.aggregate({
          _sum: { totalAmount: true },
          where: { paymentStatus: 'PAID' },
        }),
      ]);

    // C5 — FIX FieldRef : comparaison colonne-à-colonne via $queryRaw
    const lowStock = await prisma.$queryRaw<
      Array<{ id: string; quantity: number; low_stock_alert: number; product_id: string }>
    >`
      SELECT s.id, s.quantity, s.low_stock_alert, s.product_id,
             p.name_en, p.sku
      FROM stocks s
      JOIN products p ON p.id = s.product_id
      WHERE s.quantity <= s.low_stock_alert
      LIMIT 10
    `;

    const [recentOrders, categoryDistribution] = await Promise.all([
      prisma.order.findMany({
        orderBy: { createdAt: 'desc' },
        take: 8,
        include: {
          user: { select: { email: true, fullName: true } },
          items: { select: { quantity: true, totalPrice: true } },
        },
      }),
      prisma.category.findMany({
        include: { _count: { select: { products: true } } },
      }),
    ]);

    res.json({
      success: true,
      data: {
        totalProducts,
        totalOrders,
        totalUsers,
        activeSubscriptions,
        totalRevenue: revenueResult._sum.totalAmount ?? 0,
        recentOrders,
        categoryDistribution: categoryDistribution.map((c) => ({
          name: c.nameEn,
          count: c._count.products,
        })),
        lowStockAlerts: lowStock,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.get('/users', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const page = Number(req.query.page ?? 1);
    const limit = Number(req.query.limit ?? 20);

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          fullName: true,
          role: true,
          isEmailVerified: true,
          createdAt: true,
          _count: { select: { orders: true } },
        },
      }),
      prisma.user.count(),
    ]);

    res.json({
      success: true,
      data: users,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
