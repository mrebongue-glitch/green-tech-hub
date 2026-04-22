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

// POST /admin/grant-subscription — crée un abonnement test sans paiement (dev uniquement)
router.post('/grant-subscription', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { userId, plan = 'PREMIUM' } = req.body as { userId?: string; plan?: string };
    const targetId = userId ?? req.user!.sub;

    const validPlans = ['BASIC', 'PREMIUM', 'ENTERPRISE'];
    if (!validPlans.includes(plan)) {
      res.status(400).json({ success: false, message: 'Plan invalide' });
      return;
    }

    // Annuler abonnements actifs existants
    await prisma.subscription.updateMany({
      where: { userId: targetId, status: 'ACTIVE' },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
    });

    const priceMap: Record<string, number> = { BASIC: 5000, PREMIUM: 15000, ENTERPRISE: 50000 };
    const now = new Date();
    const endDate = new Date(now);
    endDate.setMonth(endDate.getMonth() + 1);

    const subscription = await prisma.subscription.create({
      data: {
        userId: targetId,
        plan: plan as 'BASIC' | 'PREMIUM' | 'ENTERPRISE',
        status: 'ACTIVE',
        paymentMethod: 'CARD',
        startDate: now,
        endDate,
        priceXaf: priceMap[plan],
      },
    });

    res.status(201).json({
      success: true,
      message: `Abonnement ${plan} activé (test)`,
      data: subscription,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
