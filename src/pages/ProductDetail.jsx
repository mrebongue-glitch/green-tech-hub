import React from 'react';
import { Link } from 'react-router-dom';
import { useParams } from 'react-router-dom';
import { productsApi, subscriptionsApi } from '@/api/customBackendClient';
import { useQuery } from '@tanstack/react-query';
import { useLanguage } from '@/lib/LanguageContext';
import { useAuth } from '@/lib/AuthContext';
import { useCart } from '@/lib/CartContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ArrowLeft, ShoppingCart, Check } from 'lucide-react';
import { toast } from 'sonner';

export default function ProductDetail() {
  const { id: productId } = useParams();
  const { t, lang } = useLanguage();
  const { isAuthenticated } = useAuth();
  const { addItem, items } = useCart();

  const { data: productRes, isLoading } = useQuery({
    queryKey: ['product', productId],
    queryFn: () => productsApi.get(productId),
    enabled: !!productId,
  });
  const product = productRes?.data;

  const { data: subRes } = useQuery({
    queryKey: ['my-subscription'],
    queryFn: () => subscriptionsApi.getMy(),
    enabled: isAuthenticated,
  });
  const isSubscribed = !!subRes?.data;
  const inCart = items.some(item => item.id === productId);

  const handleAdd = () => {
    if (!isSubscribed) {
      toast.error(t('subscription_required'));
      return;
    }
    addItem(product);
    toast.success(`${lang === 'fr' ? product.nameFr : product.nameEn} — ${t('add_to_cart')} ✓`);
  };

  const formatPrice = (price) => new Intl.NumberFormat(lang === 'fr' ? 'fr-FR' : 'en-US').format(Number(price));

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-muted rounded w-24" />
          <div className="grid md:grid-cols-2 gap-8">
            <div className="aspect-square bg-muted rounded-2xl" />
            <div className="space-y-4">
              <div className="h-8 bg-muted rounded w-3/4" />
              <div className="h-4 bg-muted rounded w-1/2" />
              <div className="h-12 bg-muted rounded w-1/3" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!product) return null;

  const name = lang === 'fr' ? product.nameFr : product.nameEn;
  const desc = lang === 'fr' ? product.descriptionFr : product.descriptionEn;
  const stockQty = product.stock?.quantity ?? 0;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      <Link to="/catalog">
        <Button variant="ghost" size="sm" className="mb-6 gap-2">
          <ArrowLeft className="w-4 h-4" /> {t('back')}
        </Button>
      </Link>

      <div className="grid md:grid-cols-2 gap-8 lg:gap-12">
        {/* Image */}
        <div className="aspect-square rounded-2xl overflow-hidden bg-muted">
          {product.imageUrl ? (
            <img src={product.imageUrl} alt={name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/5 to-primary/15">
              <ShoppingCart className="w-20 h-20 text-primary/20" />
            </div>
          )}
        </div>

        {/* Details */}
        <div className="space-y-6">
          <div>
            <Badge className="mb-3 bg-primary/10 text-primary border-primary/20">
              {t(product.category?.slug ?? '')}
            </Badge>
            <h1 className="text-3xl font-bold text-foreground">{name}</h1>
          </div>

          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-extrabold text-primary">{formatPrice(product.price)}</span>
            <span className="text-lg text-muted-foreground">{product.currency || 'XAF'}</span>
          </div>

          <Separator />

          {desc && <p className="text-muted-foreground leading-relaxed">{desc}</p>}

          <div className="flex items-center gap-2">
            {stockQty > 0 ? (
              <Badge variant="outline" className="text-primary border-primary/30">
                <Check className="w-3 h-3 mr-1" /> {t('stock')} ({stockQty})
              </Badge>
            ) : (
              <Badge variant="destructive">{t('out_of_stock')}</Badge>
            )}
            {product.ecoScore > 0 && (
              <Badge variant="secondary">Eco {product.ecoScore}/100</Badge>
            )}
          </div>

          <Separator />

          <div className="flex gap-3">
            <Button
              size="lg"
              className="flex-1 bg-primary hover:bg-primary/90 gap-2 h-12"
              onClick={handleAdd}
              disabled={inCart || stockQty === 0}
            >
              <ShoppingCart className="w-5 h-5" />
              {inCart ? t('add_to_cart') + ' ✓' : t('add_to_cart')}
            </Button>
          </div>

          {!isSubscribed && (
            <div className="p-4 rounded-xl bg-destructive/5 border border-destructive/20">
              <p className="text-sm text-destructive font-medium">{t('subscription_required')}</p>
              <Link to="/subscription">
                <Button variant="link" className="p-0 h-auto text-primary text-sm mt-1">
                  {t('subscribe_now')} →
                </Button>
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
