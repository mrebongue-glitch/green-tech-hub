import { z } from 'zod';

export const createProductSchema = z.object({
  body: z.object({
    sku: z.string().min(3).max(50).toUpperCase(),
    nameEn: z.string().min(2).max(200),
    nameFr: z.string().min(2).max(200),
    descriptionEn: z.string().max(5000).optional(),
    descriptionFr: z.string().max(5000).optional(),
    price: z.number().positive().multipleOf(0.01),
    currency: z.string().length(3).default('XAF'),
    categoryId: z.string().uuid(),
    imageUrl: z.string().url().optional(),
    imageUrls: z.array(z.string().url()).max(10).optional(),
    ecoScore: z.number().int().min(0).max(100).default(0),
    carbonKgPerUnit: z.number().positive().optional(),
    recycledContent: z.number().int().min(0).max(100).optional(),
    energyEfficiency: z.enum(['A+++', 'A++', 'A+', 'A', 'B', 'C', 'D', 'E', 'F', 'G']).optional(),
    certifications: z.array(z.string()).optional(),
    weight: z.number().positive().optional(),
    initialStock: z.number().int().min(0).default(0),
    lowStockAlert: z.number().int().min(1).default(5),
  }),
});

export const updateProductSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: createProductSchema.shape.body.partial().omit({ sku: true }),
});

export const productQuerySchema = z.object({
  query: z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
    categoryId: z.string().uuid().optional(),
    search: z.string().max(100).optional(),
    minPrice: z.coerce.number().min(0).optional(),
    maxPrice: z.coerce.number().min(0).optional(),
    minEcoScore: z.coerce.number().int().min(0).max(100).optional(),
    sortBy: z.enum(['price', 'createdAt', 'ecoScore', 'name']).default('createdAt'),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
    isActive: z.coerce.boolean().optional(),
  }),
});

export type CreateProductInput = z.infer<typeof createProductSchema>['body'];
export type UpdateProductInput = z.infer<typeof updateProductSchema>['body'];
export type ProductQuery = z.infer<typeof productQuerySchema>['query'];
