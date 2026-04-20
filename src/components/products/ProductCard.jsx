import React from 'react';
import { Link } from 'react-router-dom';
import { useLanguage } from '@/lib/LanguageContext';
import { useCart } from '@/lib/CartContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ShoppingCart, Eye } from 'lucide-react';
import { toast } from 'sonner';

export default function ProductCard({ product, isSubscribed }) {
  const { t, lang } = useLanguage();
  const { addItem } = useCart();

  const name = lang === 'fr'
    ? (product.nameFr || product.name_fr)
    : (product.nameEn || product.name_en);
  const desc = lang === 'fr'
    ? (product.descriptionFr || product.description_fr)
    : (product.descriptionEn || product.description_en);

  const handleAddToCart = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isSubscribed) {
      toast.error(t('subscription_required'));
      return;
    }
    addItem(product);
    toast.success(`${name} — ${t('add_to_cart')} ✓`);
  };

  const formatPrice = (price) => {
    return new Intl.NumberFormat(lang === 'fr' ? 'fr-FR' : 'en-US').format(price);
  };

  return (
    <Card className="group overflow-hidden border hover:shadow-xl transition-all duration-500 hover:-translate-y-1 bg-card">
      <Link to={`/product/${product.id}`}>
        <div className="aspect-[4/3] overflow-hidden bg-muted relative">
          {(product.imageUrl || product.image_url) ? (
            <img
              src={product.imageUrl || product.image_url}
              alt={name}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/5 to-primary/15">
              <ShoppingCart className="w-12 h-12 text-primary/30" />
            </div>
          )}
          <Badge className="absolute top-3 left-3 bg-primary/90 text-primary-foreground text-[10px]">
            {t(product.category?.slug ?? product.category)}
          </Badge>
        </div>
        <CardContent className="p-4 space-y-3">
          <div>
            <h3 className="font-semibold text-foreground line-clamp-1 group-hover:text-primary transition-colors">
              {name}
            </h3>
            {desc && (
              <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{desc}</p>
            )}
          </div>
          <div className="flex items-center justify-between pt-1">
            <div>
              <span className="text-lg font-bold text-primary">{formatPrice(product.price)}</span>
              <span className="text-xs text-muted-foreground ml-1">{product.currency || 'XAF'}</span>
            </div>
            <div className="flex gap-1.5">
              <Button size="icon" variant="outline" className="h-8 w-8">
                <Eye className="w-3.5 h-3.5" />
              </Button>
              <Button
                size="icon"
                className="h-8 w-8 bg-primary hover:bg-primary/90"
                onClick={handleAddToCart}
              >
                <ShoppingCart className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Link>
    </Card>
  );
}