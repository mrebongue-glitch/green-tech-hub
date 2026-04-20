import { prisma } from '../config/prisma';

const ECO_SAVINGS_MULTIPLIER = 0.35;

export async function calculateCartCarbon(
  items: Array<{ productId: string; quantity: number }>
): Promise<{ totalKgCo2: number; savedKgCo2: number; breakdown: unknown[] }> {
  const productIds = items.map((i) => i.productId);
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, nameEn: true, carbonKgPerUnit: true, ecoScore: true },
  });

  let totalKgCo2 = 0;
  let savedKgCo2 = 0;
  const breakdown = [];

  for (const item of items) {
    const product = products.find((p) => p.id === item.productId);
    if (!product?.carbonKgPerUnit) continue;

    const itemCo2 = Number(product.carbonKgPerUnit) * item.quantity;
    const conventionalCo2 = itemCo2 / (1 - ECO_SAVINGS_MULTIPLIER);
    const saved = conventionalCo2 - itemCo2;

    totalKgCo2 += itemCo2;
    savedKgCo2 += saved;

    breakdown.push({
      productId: product.id,
      productName: product.nameEn,
      quantity: item.quantity,
      kgCo2: itemCo2.toFixed(4),
      savedKgCo2: saved.toFixed(4),
      ecoScore: product.ecoScore,
    });
  }

  return {
    totalKgCo2: parseFloat(totalKgCo2.toFixed(4)),
    savedKgCo2: parseFloat(savedKgCo2.toFixed(4)),
    breakdown,
  };
}

export async function getUserCarbonProfile(userId: string, year: number, month: number) {
  const [profile, history] = await Promise.all([
    prisma.carbonProfile.findUnique({
      where: { userId_year_month: { userId, year, month } },
    }),
    prisma.carbonProfile.findMany({
      where: { userId },
      orderBy: [{ year: 'asc' }, { month: 'asc' }],
      take: 12,
    }),
  ]);
  return { current: profile, history };
}

export async function updateCarbonProfile(
  userId: string,
  kgCo2: number,
  savedKgCo2: number
): Promise<void> {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  await prisma.carbonProfile.upsert({
    where: { userId_year_month: { userId, year, month } },
    create: { userId, year, month, totalKgCo2: kgCo2, savedKgCo2, ordersCount: 1 },
    update: {
      totalKgCo2: { increment: kgCo2 },
      savedKgCo2: { increment: savedKgCo2 },
      ordersCount: { increment: 1 },
    },
  });
}
