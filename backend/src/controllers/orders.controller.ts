import crypto from 'crypto';
import { Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';
import { auditLog } from '../config/logger';
import { AuthRequest } from '../types';
import { AppError } from '../middleware/errorHandler.middleware';
import { CreateOrderInput } from '../schemas/order.schema';

function generateOrderNumber(): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  // crypto.randomBytes pour éviter les collisions (M — ordre number)
  const rand = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `GMT-${date}-${rand}`;
}

export const createOrder = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { items, addressId, notes } = req.body as CreateOrderInput;
    const userId = req.user!.sub;

    // Vérification préliminaire des produits (hors transaction — lecture seule)
    const productIds = items.map((i: { productId: string; quantity: number }) => i.productId);
    const products = await prisma.product.findMany({
      where: { id: { in: productIds }, isActive: true },
      select: {
        id: true,
        nameEn: true,
        price: true,
        currency: true,
        carbonKgPerUnit: true,
      },
    });

    if (products.length !== productIds.length) {
      throw new AppError(400, 'One or more products not found or inactive');
    }

    // Calcul des totaux (hors transaction — pas de lock nécessaire ici)
    let subtotal = new Prisma.Decimal(0);
    let totalCarbonKg = new Prisma.Decimal(0);

    const orderItems = items.map((item) => {
      const product = products.find((p) => p.id === item.productId)!;
      const unitPrice = product.price;
      const totalPrice = unitPrice.mul(item.quantity);
      const carbonKg = product.carbonKgPerUnit
        ? product.carbonKgPerUnit.mul(item.quantity)
        : undefined;

      subtotal = subtotal.add(totalPrice);
      if (carbonKg) totalCarbonKg = totalCarbonKg.add(carbonKg);

      return {
        productId: product.id,
        nameSnapshot: product.nameEn,
        quantity: item.quantity,
        unitPrice,
        totalPrice,
        carbonKg,
      };
    });

    // C1 — FIX TOCTOU : vérification ET réservation stock dans la même transaction
    // L'UPDATE conditionnel est atomique au niveau DB — pas de race condition possible
    const order = await prisma.$transaction(async (tx) => {
      // Réservation atomique pour chaque produit
      for (const item of items) {
        const reserved = await tx.$executeRaw`
          UPDATE stocks
          SET reserved_qty = reserved_qty + ${item.quantity}
          WHERE product_id = ${item.productId}::uuid
            AND (quantity - reserved_qty) >= ${item.quantity}
        `;

        if (reserved === 0) {
          const product = products.find((p) => p.id === item.productId);
          throw new AppError(400, `Insufficient stock for "${product?.nameEn ?? item.productId}"`);
        }
      }

      return tx.order.create({
        data: {
          orderNumber: generateOrderNumber(),
          userId,
          addressId,
          subtotal,
          totalAmount: subtotal,
          totalCarbonKg,
          notes,
          items: { create: orderItems },
        },
        include: { items: true },
      });
    });

    auditLog('order.created', { orderId: order.id, userId, totalAmount: order.totalAmount });

    res.status(201).json({ success: true, data: order });
  } catch (err) {
    next(err);
  }
};

export const listMyOrders = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const page = Number(req.query.page ?? 1);
    const limit = Number(req.query.limit ?? 10);
    const skip = (page - 1) * limit;

    const where: Prisma.OrderWhereInput = {
      userId: req.user!.sub,
      ...(req.query.status && { status: req.query.status as never }),
    };

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          items: { include: { product: { select: { imageUrl: true } } } },
          address: true,
        },
      }),
      prisma.order.count({ where }),
    ]);

    res.json({
      success: true,
      data: orders,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
};

export const getOrder = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const order = await prisma.order.findFirst({
      where: {
        id: req.params.id,
        ...(req.user!.role === 'CUSTOMER' && { userId: req.user!.sub }),
      },
      include: {
        items: true,
        address: true,
        user: { select: { email: true, fullName: true } },
      },
    });

    if (!order) throw new AppError(404, 'Order not found');
    res.json({ success: true, data: order });
  } catch (err) {
    next(err);
  }
};

export const updateOrderStatus = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { status } = req.body;

    const order = await prisma.order.findUnique({ where: { id: req.params.id } });
    if (!order) throw new AppError(404, 'Order not found');

    if (order.status === 'DELIVERED' || order.status === 'REFUNDED') {
      throw new AppError(400, `Cannot update a ${order.status} order`);
    }

    const updated = await prisma.$transaction(async (tx) => {
      const updatedOrder = await tx.order.update({
        where: { id: req.params.id },
        data: { status },
      });

      if (status === 'DELIVERED') {
        const orderItems = await tx.orderItem.findMany({ where: { orderId: req.params.id } });
        for (const item of orderItems) {
          await tx.stock.update({
            where: { productId: item.productId },
            data: {
              quantity: { decrement: item.quantity },
              reservedQty: { decrement: item.quantity },
            },
          });
          await tx.stockMovement.create({
            data: {
              productId: item.productId,
              type: 'OUT',
              quantity: item.quantity,
              reason: 'Order delivered',
              reference: order.orderNumber,
            },
          });
        }
      }

      if (status === 'CANCELLED') {
        const orderItems = await tx.orderItem.findMany({ where: { orderId: req.params.id } });
        for (const item of orderItems) {
          await tx.stock.update({
            where: { productId: item.productId },
            data: { reservedQty: { decrement: item.quantity } },
          });
        }
      }

      return updatedOrder;
    });

    auditLog('order.status_updated', {
      orderId: req.params.id,
      from: order.status,
      to: status,
      adminId: req.user!.sub,
    });

    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
};
