import React from 'react';
import { subscriptionsApi } from '@/api/customBackendClient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLanguage } from '@/lib/LanguageContext';
import { useAuth } from '@/lib/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, Star, Zap, Crown } from 'lucide-react';
import { toast } from 'sonner';

const plans = [
  {
    key: 'BASIC',
    icon: Zap,
    price: 5000,
    features_fr: ['Accès au catalogue', 'Panier & commandes', 'Support email'],
    features_en: ['Catalog access', 'Cart & orders', 'Email support'],
  },
  {
    key: 'PREMIUM',
    icon: Star,
    price: 15000,
    popular: true,
    features_fr: ['Tout de Basique', 'Prix préférentiels', 'Support prioritaire', 'Factures détaillées'],
    features_en: ['Everything in Basic', 'Preferred pricing', 'Priority support', 'Detailed invoices'],
  },
  {
    key: 'ENTERPRISE',
    icon: Crown,
    price: 50000,
    features_fr: ['Tout de Premium', 'Gestionnaire dédié', 'Livraison express', 'Remises volume'],
    features_en: ['Everything in Premium', 'Dedicated manager', 'Express delivery', 'Volume discounts'],
  },
];

export default function Subscription() {
  const { t, lang } = useLanguage();
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();

  const { data: subRes, isLoading } = useQuery({
    queryKey: ['my-subscription'],
    queryFn: () => subscriptionsApi.getMy(),
    enabled: isAuthenticated,
  });
  const activeSub = subRes?.data;

  const subscribeMutation = useMutation({
    mutationFn: async (planKey) => {
      const res = await subscriptionsApi.checkout(planKey);
      // Le backend retourne une URL Stripe checkout — on redirige si disponible
      if (res?.data?.checkoutUrl) {
        window.location.href = res.data.checkoutUrl;
        return;
      }
      return res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-subscription'] });
      toast.success(lang === 'fr' ? 'Abonnement activé avec succès !' : 'Subscription activated successfully!');
    },
    onError: (err) => {
      toast.error(err.message ?? (lang === 'fr' ? 'Erreur lors de l\'abonnement' : 'Subscription failed'));
    },
  });

  const formatPrice = (price) => new Intl.NumberFormat(lang === 'fr' ? 'fr-FR' : 'en-US').format(price);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12">
      <div className="text-center mb-12">
        <h1 className="text-3xl font-bold text-foreground">{t('subscription')}</h1>
        <p className="text-muted-foreground mt-2 max-w-lg mx-auto">
          {lang === 'fr'
            ? 'Choisissez le plan qui vous convient et profitez de tous nos services.'
            : 'Choose the plan that suits you and enjoy all our services.'}
        </p>
        <div className="w-16 h-1 bg-primary rounded-full mx-auto mt-4" />
      </div>

      {activeSub && (
        <Card className="mb-8 border-primary/30 bg-primary/5">
          <CardContent className="p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <p className="text-sm text-muted-foreground">{t('current_plan')}</p>
              <p className="text-xl font-bold text-primary capitalize">{t(activeSub.plan?.toLowerCase())}</p>
            </div>
            <div className="flex items-center gap-3">
              <Badge className="bg-primary text-primary-foreground">{t('active')}</Badge>
              <span className="text-sm text-muted-foreground">
                {lang === 'fr' ? 'Expire le' : 'Expires'}{' '}
                {activeSub.endDate ? new Date(activeSub.endDate).toLocaleDateString() : '—'}
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid md:grid-cols-3 gap-6">
        {plans.map((plan) => {
          const isCurrentPlan = activeSub?.plan === plan.key;
          const features = lang === 'fr' ? plan.features_fr : plan.features_en;
          return (
            <Card
              key={plan.key}
              className={`relative overflow-hidden transition-all duration-300 hover:shadow-xl hover:-translate-y-1 ${
                plan.popular ? 'border-primary shadow-lg ring-1 ring-primary/20' : ''
              }`}
            >
              {plan.popular && (
                <div className="absolute top-0 right-0 bg-primary text-primary-foreground text-xs font-semibold px-3 py-1 rounded-bl-xl">
                  {lang === 'fr' ? 'Populaire' : 'Popular'}
                </div>
              )}
              <CardHeader className="text-center pb-2">
                <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-3">
                  <plan.icon className="w-7 h-7 text-primary" />
                </div>
                <CardTitle className="capitalize">{t(plan.key.toLowerCase())}</CardTitle>
                <div className="mt-4">
                  <span className="text-4xl font-extrabold text-foreground">{formatPrice(plan.price)}</span>
                  <span className="text-muted-foreground ml-1 text-sm">XAF {t('per_month')}</span>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  {features.map((feat, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <Check className="w-3 h-3 text-primary" />
                      </div>
                      <span className="text-foreground/80">{feat}</span>
                    </div>
                  ))}
                </div>
                <Button
                  className={`w-full h-11 ${
                    isCurrentPlan
                      ? 'bg-muted text-muted-foreground'
                      : 'bg-primary hover:bg-primary/90 text-primary-foreground'
                  }`}
                  disabled={isCurrentPlan || subscribeMutation.isPending || isLoading}
                  onClick={() => subscribeMutation.mutate(plan.key)}
                >
                  {isCurrentPlan ? t('current_plan') : t('choose_plan')}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
