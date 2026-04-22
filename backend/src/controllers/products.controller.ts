import { Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';
import { auditLog } from '../config/logger';
import { AuthRequest } from '../types';
import { AppError } from '../middleware/errorHandler.middleware';
import { CreateProductInput, ProductQuery, UpdateProductInput } from '../schemas/product.schema';

export const listProducts = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const q = req.query as unknown as ProductQuery;
    const page = Number(q.page ?? 1);
    const limit = Number(q.limit ?? 20);
    const skip = (page - 1) * limit;

    const where: Prisma.ProductWhereInput = {
      ...(q.isActive !== undefined && { isActive: q.isActive }),
      ...(q.categoryId && { categoryId: q.categoryId }),
      ...(q.minEcoScore !== undefined && { ecoScore: { gte: Number(q.minEcoScore) } }),
      ...(q.minPrice !== undefined || q.maxPrice !== undefined
        ? {
            price: {
              ...(q.minPrice !== undefined && { gte: new Prisma.Decimal(q.minPrice) }),
              ...(q.maxPrice !== undefined && { lte: new Prisma.Decimal(q.maxPrice) }),
            },
          }
        : {}),
      ...(q.search && {
        OR: [
          { nameEn: { contains: q.search } },
          { nameFr: { contains: q.search } },
        ],
      }),
    };

    const orderBy: Prisma.ProductOrderByWithRelationInput =
      q.sortBy === 'name'
        ? { nameEn: q.sortOrder ?? 'desc' }
        : { [q.sortBy ?? 'createdAt']: q.sortOrder ?? 'desc' };

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        include: {
          category: { select: { id: true, slug: true, nameEn: true, nameFr: true } },
          stock: { select: { quantity: true, reservedQty: true } },
        },
      }),
      prisma.product.count({ where }),
    ]);

    res.json({
      success: true,
      data: products,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
};

export const getProduct = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const product = await prisma.product.findUnique({
      where: { id: req.params.id },
      include: { category: true, stock: true },
    });

    if (!product) throw new AppError(404, 'Product not found');
    res.json({ success: true, data: product });
  } catch (err) {
    next(err);
  }
};

export const createProduct = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const body = req.body as CreateProductInput;
    const { initialStock, lowStockAlert, ...productData } = body;

    // M6 — création produit + stock + mouvement dans une seule transaction atomique
    const product = await prisma.$transaction(async (tx) => {
      const newProduct = await tx.product.create({
        data: {
          ...productData,
          price: new Prisma.Decimal(productData.price),
          carbonKgPerUnit: productData.carbonKgPerUnit
            ? new Prisma.Decimal(productData.carbonKgPerUnit)
            : undefined,
          weight: productData.weight ? new Prisma.Decimal(productData.weight) : undefined,
          stock: {
            create: {
              quantity: initialStock ?? 0,
              lowStockAlert: lowStockAlert ?? 5,
            },
          },
        },
        include: { stock: true, category: true },
      });

      if (initialStock && initialStock > 0) {
        await tx.stockMovement.create({
          data: {
            productId: newProduct.id,
            type: 'IN',
            quantity: initialStock,
            reason: 'Initial stock',
          },
        });
      }

      return newProduct;
    });

    auditLog('product.created', { productId: product.id, sku: product.sku, adminId: req.user!.sub });
    res.status(201).json({ success: true, data: product });
  } catch (err) {
    next(err);
  }
};

export const updateProduct = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const body = req.body as UpdateProductInput;

    const product = await prisma.product.update({
      where: { id: req.params.id },
      data: {
        ...body,
        price: body.price ? new Prisma.Decimal(body.price) : undefined,
        carbonKgPerUnit: body.carbonKgPerUnit
          ? new Prisma.Decimal(body.carbonKgPerUnit)
          : undefined,
        weight: body.weight ? new Prisma.Decimal(body.weight) : undefined,
      },
      include: { stock: true, category: true },
    });

    auditLog('product.updated', { productId: product.id, adminId: req.user!.sub });
    res.json({ success: true, data: product });
  } catch (err) {
    next(err);
  }
};

export const deleteProduct = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    await prisma.product.update({
      where: { id: req.params.id },
      data: { isActive: false },
    });
    auditLog('product.deactivated', { productId: req.params.id, adminId: req.user!.sub });
    res.json({ success: true, message: 'Product deactivated' });
  } catch (err) {
    next(err);
  }
};

export const updateStock = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { quantity, type, reason } = req.body as {
      quantity: number;
      type: 'IN' | 'OUT' | 'ADJUSTMENT';
      reason?: string;
    };

    const stock = await prisma.stock.findUnique({ where: { productId: req.params.id } });
    if (!stock) throw new AppError(404, 'Stock record not found');

    let newQty: number;
    if (type === 'ADJUSTMENT') {
      newQty = quantity;
    } else if (type === 'IN') {
      newQty = stock.quantity + quantity;
    } else {
      newQty = stock.quantity - quantity;
      if (newQty < 0) throw new AppError(400, 'Insufficient stock');
    }

    const [updatedStock] = await prisma.$transaction([
      prisma.stock.update({
        where: { productId: req.params.id },
        data: { quantity: newQty },
      }),
      prisma.stockMovement.create({
        data: { productId: req.params.id, type, quantity, reason },
      }),
    ]);

    auditLog('stock.updated', {
      productId: req.params.id,
      type,
      quantity,
      newQty,
      adminId: req.user!.sub,
    });
    res.json({ success: true, data: updatedStock });
  } catch (err) {
    next(err);
  }
};
