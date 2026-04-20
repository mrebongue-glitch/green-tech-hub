import React, { useState } from 'react';
import { productsApi, subscriptionsApi } from '@/api/customBackendClient';
import { useQuery } from '@tanstack/react-query';
import { useLanguage } from '@/lib/LanguageContext';
import { useAuth } from '@/lib/AuthContext';
import ProductCard from '@/components/products/ProductCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Search, Monitor, Printer, Gamepad2, Tv, LayoutGrid } from 'lucide-react';

const categoryFilters = [
  { key: 'all', icon: LayoutGrid },
  { key: 'informatique', icon: Monitor },
  { key: 'services', icon: Printer },
  { key: 'jeux_video', icon: Gamepad2 },
  { key: 'televiseurs', icon: Tv },
];

export default function Catalog() {
  const { t, lang } = useLanguage();
  const { isAuthenticated } = useAuth();
  const urlParams = new URLSearchParams(window.location.search);
  const initialCategory = urlParams.get('category') || 'all';
  const [activeCategory, setActiveCategory] = useState(initialCategory);
  const [search, setSearch] = useState('');

  const { data: productsRes, isLoading } = useQuery({
    queryKey: ['products'],
    queryFn: () => productsApi.list({ isActive: true, limit: 100 }),
  });
  const products = productsRes?.data ?? [];

  const { data: subRes } = useQuery({
    queryKey: ['my-subscription'],
    queryFn: () => subscriptionsApi.getMy(),
    enabled: isAuthenticated,
  });
  const isSubscribed = !!subRes?.data;

  // Filtrage local : category par slug, recherche par nom
  const filtered = products.filter(p => {
    const catMatch = activeCategory === 'all' || p.category?.slug === activeCategory;
    const name = lang === 'fr' ? p.nameFr : p.nameEn;
    const searchMatch = !search || name?.toLowerCase().includes(search.toLowerCase());
    return catMatch && searchMatch;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground">{t('catalog')}</h1>
        <p className="text-muted-foreground mt-1">{t('slogan')}</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 mb-8">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder={t('search')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {categoryFilters.map(({ key, icon: Icon }) => (
            <Button
              key={key}
              variant={activeCategory === key ? 'default' : 'outline'}
              size="sm"
              onClick={() => setActiveCategory(key)}
              className="gap-1.5"
            >
              <Icon className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{key === 'all' ? t('all_categories') : t(key)}</span>
            </Button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {Array(8).fill(0).map((_, i) => (
            <div key={i} className="space-y-3">
              <Skeleton className="aspect-[4/3] w-full rounded-lg" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          ))}
        </div>
      ) : filtered.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filtered.map(product => (
            <ProductCard key={product.id} product={product} isSubscribed={isSubscribed} />
          ))}
        </div>
      ) : (
        <div className="text-center py-20">
          <p className="text-muted-foreground text-lg">{t('no_products')}</p>
        </div>
      )}
    </div>
  );
}
