import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

async function main() {
  // ── Utilisateur test ────────────────────────────────────────────────────────
  const email = 'test@greenmarket.cm';
  const password = 'Test1234!';

  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        email,
        passwordHash: await argon2.hash(password),
        fullName: 'Utilisateur Test',
        role: 'CUSTOMER',
        isEmailVerified: true,
      },
    });
    console.log(`✓ Utilisateur créé   : ${email} / ${password}`);
  } else {
    console.log(`✓ Utilisateur existant : ${email}`);
  }

  // ── Abonnement PREMIUM actif ────────────────────────────────────────────────
  await prisma.subscription.updateMany({
    where: { userId: user.id, status: 'ACTIVE' },
    data: { status: 'CANCELLED', cancelledAt: new Date() },
  });
  const now = new Date();
  const endDate = new Date(now);
  endDate.setMonth(endDate.getMonth() + 1);
  const sub = await prisma.subscription.create({
    data: {
      userId: user.id, plan: 'PREMIUM', status: 'ACTIVE',
      paymentMethod: 'CARD', startDate: now, endDate, priceXaf: 15000,
    },
  });
  console.log(`✓ Abonnement PREMIUM actif — expire le ${endDate.toLocaleDateString('fr-FR')}`);

  // ── Catégories ──────────────────────────────────────────────────────────────
  const categories = [
    { slug: 'informatique', nameEn: 'Computer Products', nameFr: 'Produits informatiques', ecoScore: 70 },
    { slug: 'services',     nameEn: 'Secretarial Services', nameFr: 'Services de secrétariat', ecoScore: 90 },
    { slug: 'jeux_video',   nameEn: 'Video Game Consoles', nameFr: 'Consoles de jeux vidéo', ecoScore: 50 },
    { slug: 'televiseurs',  nameEn: 'Televisions', nameFr: 'Téléviseurs', ecoScore: 60 },
  ];

  const catMap: Record<string, string> = {};
  for (const c of categories) {
    const cat = await prisma.category.upsert({
      where: { slug: c.slug },
      update: {},
      create: c,
    });
    catMap[c.slug] = cat.id;
    console.log(`✓ Catégorie : ${c.nameFr}`);
  }

  // ── Produits ────────────────────────────────────────────────────────────────
  const products = [
    { sku: 'INF-001', nameEn: 'Dell Latitude Laptop 14"', nameFr: 'Laptop Dell Latitude 14"',
      price: 185000, categorySlug: 'informatique', ecoScore: 87,
      imageUrl: 'https://images.unsplash.com/photo-1496181133206-80ce9b88a853?w=600&q=80' },
    { sku: 'INF-002', nameEn: 'HP LaserJet Printer', nameFr: 'Imprimante HP LaserJet',
      price: 75000, categorySlug: 'informatique', ecoScore: 72,
      imageUrl: 'https://images.unsplash.com/photo-1612815154858-60aa4c59eaa6?w=600&q=80' },
    { sku: 'INF-003', nameEn: 'SanDisk SSD 1TB', nameFr: 'Disque SSD SanDisk 1To',
      price: 45000, categorySlug: 'informatique', ecoScore: 80,
      imageUrl: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=600&q=80' },
    { sku: 'SVC-001', nameEn: 'Word Processing Service', nameFr: 'Saisie et mise en page',
      price: 5000, categorySlug: 'services', ecoScore: 95,
      imageUrl: 'https://images.unsplash.com/photo-1553877522-43269d4ea984?w=600&q=80' },
    { sku: 'SVC-002', nameEn: 'PC Maintenance & Cleaning', nameFr: 'Maintenance et nettoyage PC',
      price: 15000, categorySlug: 'services', ecoScore: 92,
      imageUrl: 'https://images.unsplash.com/photo-1597872200969-2b65d56bd16b?w=600&q=80' },
    { sku: 'JEU-001', nameEn: 'PlayStation 5', nameFr: 'PlayStation 5',
      price: 350000, categorySlug: 'jeux_video', ecoScore: 55,
      imageUrl: 'https://images.unsplash.com/photo-1606813907291-d86efa9b94db?w=600&q=80' },
    { sku: 'JEU-002', nameEn: 'Nintendo Switch OLED', nameFr: 'Nintendo Switch OLED',
      price: 220000, categorySlug: 'jeux_video', ecoScore: 60,
      imageUrl: 'https://images.unsplash.com/photo-1578303512597-81e6cc155b3e?w=600&q=80' },
    { sku: 'TV-001', nameEn: 'Samsung 4K Smart TV 55"', nameFr: 'TV Samsung 4K 55 pouces',
      price: 280000, categorySlug: 'televiseurs', ecoScore: 65,
      imageUrl: 'https://images.unsplash.com/photo-1593359677879-a4bb92f829e1?w=600&q=80' },
    { sku: 'TV-002', nameEn: 'LG OLED 48"', nameFr: 'TV LG OLED 48 pouces',
      price: 420000, categorySlug: 'televiseurs', ecoScore: 62,
      imageUrl: 'https://images.unsplash.com/photo-1461151304267-38535e780c79?w=600&q=80' },
  ];

  for (const p of products) {
    const product = await prisma.product.upsert({
      where: { sku: p.sku },
      update: {},
      create: {
        sku: p.sku, nameEn: p.nameEn, nameFr: p.nameFr,
        price: p.price, currency: 'XAF',
        categoryId: catMap[p.categorySlug],
        imageUrl: p.imageUrl, imageUrls: [],
        ecoScore: p.ecoScore, isActive: true,
        certifications: [],
      },
    });
    await prisma.stock.upsert({
      where: { productId: product.id },
      update: {},
      create: { productId: product.id, quantity: 10, reservedQty: 0, lowStockAlert: 2 },
    });
    console.log(`✓ Produit : ${p.nameFr}`);
  }

  console.log('');
  console.log('── Connexion ──────────────────────────────────────');
  console.log(`  Email         : ${email}`);
  console.log(`  Mot de passe  : ${password}`);
  console.log(`  Abonnement    : PREMIUM jusqu'au ${endDate.toLocaleDateString('fr-FR')}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
