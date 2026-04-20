import React from 'react';
import { productsApi, subscriptionsApi } from '@/api/customBackendClient';
import { useQuery } from '@tanstack/react-query';
import { useLanguage } from '@/lib/LanguageContext';
import { useAuth } from '@/lib/AuthContext';
import HeroSection from '@/components/home/HeroSection';
import CategoryCards from '@/components/home/CategoryCards';
import ProductCard from '@/components/products/ProductCard';
import { Skeleton } from '@/components/ui/skeleton';

export default function Home() {
  const { t } = useLanguage();
  const { isAuthenticated } = useAuth();

  const { data: productsRes, isLoading } = useQuery({
    queryKey: ['featured-products'],
    queryFn: () => productsApi.list({ isActive: true, limit: 8 }),
  });
  const products = productsRes?.data ?? [];

  const { data: subRes } = useQuery({
    queryKey: ['my-subscription'],
    queryFn: () => subscriptionsApi.getMy(),
    enabled: isAuthenticated,
  });
  const isSubscribed = !!subRes?.data;

  return (
    <div>
      <HeroSection />
      <CategoryCards />

      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-16">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-foreground">{t('featured')}</h2>
          <div className="w-16 h-1 bg-primary rounded-full mx-auto mt-4" />
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {Array(4).fill(0).map((_, i) => (
              <div key={i} className="space-y-3">
                <Skeleton className="aspect-[4/3] w-full rounded-lg" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            ))}
          </div>
        ) : products.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {products.map(product => (
              <ProductCard key={product.id} product={product} isSubscribed={isSubscribed} />
            ))}
          </div>
        ) : (
          <p className="text-center text-muted-foreground py-12">{t('no_products')}</p>
        )}
      </section>
    </div>
  );
}
