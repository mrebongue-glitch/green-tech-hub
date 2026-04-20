import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ordersApi } from '@/api/customBackendClient';
import { useAuth } from '@/lib/AuthContext';
import { useLanguage } from '@/lib/LanguageContext';
import { useCart } from '@/lib/CartContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Minus, Plus, Trash2, ShoppingBag, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';

export default function Cart() {
  const { t, lang } = useLanguage();
  const { user, isAuthenticated } = useAuth();
  const { items, updateQuantity, removeItem, clearCart, totalAmount } = useCart();
  const navigate = useNavigate();
  const [loading, setLoading] = React.useState(false);

  const formatPrice = (price) => new Intl.NumberFormat(lang === 'fr' ? 'fr-FR' : 'en-US').format(price);

  const handleCheckout = async () => {
    if (!isAuthenticated || !user) {
      toast.error(lang === 'fr' ? 'Connectez-vous pour passer commande' : 'Please log in to place an order');
      return;
    }
    setLoading(true);
    try {
      // Le backend calcule les prix depuis la DB — on envoie uniquement productId + quantity
      const orderItems = items.map(item => ({
        productId: item.id,
        quantity: item.quantity,
      }));
      await ordersApi.create({ items: orderItems });
      clearCart();
      toast.success(t('order_placed'));
      navigate('/orders');
    } catch (err) {
      toast.error(err.message ?? (lang === 'fr' ? 'Erreur lors de la commande' : 'Order failed'));
    } finally {
      setLoading(false);
    }
  };

  if (items.length === 0) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-16 text-center">
        <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mx-auto mb-6">
          <ShoppingBag className="w-10 h-10 text-muted-foreground" />
        </div>
        <h2 className="text-2xl font-bold text-foreground mb-2">{t('empty_cart')}</h2>
        <Link to="/catalog">
          <Button className="mt-4 bg-primary hover:bg-primary/90 gap-2">
            <ArrowLeft className="w-4 h-4" /> {t('continue_shopping')}
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      <h1 className="text-3xl font-bold text-foreground mb-8">{t('cart')}</h1>

      <div className="grid lg:grid-cols-3 gap-8">
        {/* Items */}
        <div className="lg:col-span-2 space-y-4">
          {items.map(item => {
            const name = lang === 'fr' ? item.name_fr : item.name_en;
            return (
              <Card key={item.id}>
                <CardContent className="p-4 flex gap-4">
                  <div className="w-20 h-20 rounded-lg overflow-hidden bg-muted shrink-0">
                    {item.image_url ? (
                      <img src={item.image_url} alt={name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-primary/5">
                        <ShoppingBag className="w-6 h-6 text-primary/30" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-foreground truncate">{name}</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      {formatPrice(item.price)} {item.currency || 'XAF'}
                    </p>
                    <div className="flex items-center gap-2 mt-3">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => updateQuantity(item.id, item.quantity - 1)}
                      >
                        <Minus className="w-3 h-3" />
                      </Button>
                      <span className="text-sm font-medium w-8 text-center">{item.quantity}</span>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => updateQuantity(item.id, item.quantity + 1)}
                      >
                        <Plus className="w-3 h-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 ml-auto text-destructive"
                        onClick={() => removeItem(item.id)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="font-bold text-primary">
                      {formatPrice(item.price * item.quantity)}
                    </span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Summary */}
        <Card className="h-fit sticky top-24">
          <CardHeader>
            <CardTitle>{t('order_summary')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{t('subtotal')} ({items.length} {t('items')})</span>
              <span className="font-medium">{formatPrice(totalAmount)} XAF</span>
            </div>
            <Separator />
            <div className="flex justify-between">
              <span className="font-semibold">{t('total')}</span>
              <span className="text-xl font-bold text-primary">{formatPrice(totalAmount)} XAF</span>
            </div>
            <Button
              className="w-full bg-primary hover:bg-primary/90 h-12 text-base"
              onClick={handleCheckout}
              disabled={loading}
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
              ) : (
                t('checkout')
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
