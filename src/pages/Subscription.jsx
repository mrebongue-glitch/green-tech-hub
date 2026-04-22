import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { loadStripe } from '@stripe/stripe-js';
import { Elements } from '@stripe/react-stripe-js';
import { subscriptionsApi } from '@/api/customBackendClient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLanguage } from '@/lib/LanguageContext';
import { useAuth } from '@/lib/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Check, Star, Zap, Crown, CreditCard, Smartphone,
  ArrowLeft, Loader2, CheckCircle2, XCircle, AlertCircle, LogIn,
  RefreshCw, LayoutGrid, Clock,
} from 'lucide-react';
import { toast } from 'sonner';
import StripeCardForm from '@/components/payment/StripeCardForm';
import LoginModal from '@/components/auth/LoginModal';

// Chargé une seule fois au niveau module (évite de recréer à chaque render)
const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY ?? '');

// ── Constants ────────────────────────────────────────────────────────────────

const SESSION_KEY = 'gmt_payment_id';
const POLL_INTERVAL_MS = 3000;
const POLL_MAX = 20; // 60 s total

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

const paymentMethods = [
  {
    key: 'ORANGE_MONEY',
    label_fr: 'Orange Money',
    label_en: 'Orange Money',
    color: 'border-orange-400 bg-orange-50 text-orange-700',
    activeColor: 'border-orange-500 ring-2 ring-orange-300 bg-orange-50',
    dot: 'bg-orange-500',
    icon: Smartphone,
    needsPhone: true,
  },
  {
    key: 'MTN_MOBILE_MONEY',
    label_fr: 'MTN Mobile Money',
    label_en: 'MTN Mobile Money',
    color: 'border-yellow-400 bg-yellow-50 text-yellow-700',
    activeColor: 'border-yellow-500 ring-2 ring-yellow-300 bg-yellow-50',
    dot: 'bg-yellow-400',
    icon: Smartphone,
    needsPhone: true,
  },
  {
    key: 'CARD',
    label_fr: 'Carte bancaire (Visa / Mastercard)',
    label_en: 'Credit / Debit card (Visa / Mastercard)',
    color: 'border-blue-400 bg-blue-50 text-blue-700',
    activeColor: 'border-blue-500 ring-2 ring-blue-300 bg-blue-50',
    dot: 'bg-blue-500',
    icon: CreditCard,
    needsPhone: false,
  },
];

// ── Main component ────────────────────────────────────────────────────────────

export default function Subscription() {
  const { t, lang } = useLanguage();
  const { isAuthenticated, user } = useAuth(); // isAuthenticated: guard query; user: email display
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  // UI state machine
  const [loginOpen, setLoginOpen] = useState(false);
  const [step, setStep] = useState('plans'); // 'plans' | 'payment' | 'polling' | 'success' | 'error'
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState('ORANGE_MONEY');
  const [phone, setPhone] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [clientSecret, setClientSecret] = useState(null);

  const pollCount = useRef(0);
  const pollTimer = useRef(null);
  const plansRef = useRef(null);

  // ── Current subscription ──────────────────────────────────────────────────

  const { data: subRes, isLoading: subLoading } = useQuery({
    queryKey: ['my-subscription'],
    queryFn: () => subscriptionsApi.getMy(),
    enabled: isAuthenticated,
    retry: false,
  });
  const activeSub = subRes?.data;

  // ── Handle return from payment provider ──────────────────────────────────

  useEffect(() => {
    const success = searchParams.get('success');
    const cancelled = searchParams.get('cancelled');

    if (success === 'true') {
      setSearchParams({}, { replace: true });
      const pid = sessionStorage.getItem(SESSION_KEY);
      if (pid) {
        setStep('polling');
        startPolling(pid);
      } else {
        // Stripe webhook already handled — just refresh subscription
        queryClient.invalidateQueries({ queryKey: ['my-subscription'] });
        setStep('success');
      }
    } else if (cancelled === 'true') {
      setSearchParams({}, { replace: true });
      sessionStorage.removeItem(SESSION_KEY);
      toast.info(lang === 'fr' ? t('payment_cancelled') : t('payment_cancelled'));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Polling ───────────────────────────────────────────────────────────────

  const startPolling = useCallback((paymentId) => {
    pollCount.current = 0;

    const poll = async () => {
      pollCount.current += 1;

      try {
        const res = await subscriptionsApi.verifyPayment(paymentId);
        const status = res?.data?.status;

        if (status === 'SUCCESS') {
          sessionStorage.removeItem(SESSION_KEY);
          queryClient.invalidateQueries({ queryKey: ['my-subscription'] });
          setStep('success');
          return;
        }

        if (status === 'FAILED' || status === 'CANCELLED' || status === 'EXPIRED') {
          sessionStorage.removeItem(SESSION_KEY);
          setStep('error');
          return;
        }
      } catch {
        // Network error — keep polling
      }

      if (pollCount.current >= POLL_MAX) {
        sessionStorage.removeItem(SESSION_KEY);
        setStep('error');
        return;
      }

      pollTimer.current = setTimeout(poll, POLL_INTERVAL_MS);
    };

    poll();
  }, [queryClient]);

  useEffect(() => {
    return () => { if (pollTimer.current) clearTimeout(pollTimer.current); };
  }, []);

  // ── Checkout mutation ─────────────────────────────────────────────────────

  const checkoutMutation = useMutation({
    mutationFn: () => {
      const methodConfig = paymentMethods.find(m => m.key === paymentMethod);
      if (methodConfig?.needsPhone) {
        const normalized = phone.replace(/\s+/g, '').replace(/^\+/, '').replace(/^0/, '237');
        if (!/^237[6-9]\d{8}$/.test(normalized)) {
          setPhoneError(t('phone_format_hint'));
          throw new Error('invalid_phone');
        }
        setPhoneError('');
        return subscriptionsApi.checkout({ plan: selectedPlan, paymentMethod, phone: normalized });
      }
      return subscriptionsApi.checkout({ plan: selectedPlan, paymentMethod });
    },
    onSuccess: (res) => {
      const { checkoutUrl, clientSecret: cs, paymentId, provider } = res?.data ?? {};

      // Stripe Elements — formulaire embarqué, pas de redirection
      if (provider === 'STRIPE' && cs) {
        setClientSecret(cs);
        setStep('card-form');
        return;
      }

      // Notchpay — redirection vers page de paiement Mobile Money
      if (paymentId) sessionStorage.setItem(SESSION_KEY, paymentId);
      if (checkoutUrl) {
        setIsRedirecting(true);
        window.location.href = checkoutUrl;
      } else {
        queryClient.invalidateQueries({ queryKey: ['my-subscription'] });
        setStep('success');
      }
    },
    onError: (err) => {
      if (err.message === 'invalid_phone') return;
      // Surface backend Zod field errors (e.g. invalid phone format)
      if (err.errors?.phone?.[0]) {
        setPhoneError(err.errors.phone[0]);
        return;
      }
      toast.error(err.message ?? (lang === 'fr' ? 'Erreur lors du paiement' : 'Payment error'));
    },
  });

  // ── Cancel mutation ───────────────────────────────────────────────────────

  const cancelMutation = useMutation({
    mutationFn: () => subscriptionsApi.cancel(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-subscription'] });
      setShowCancelConfirm(false);
      toast.success(lang === 'fr' ? 'Abonnement annulé.' : 'Subscription cancelled.');
    },
    onError: (err) => {
      toast.error(err.message ?? 'Error');
    },
  });

  // ── Helpers ───────────────────────────────────────────────────────────────

  const formatPrice = (price) =>
    new Intl.NumberFormat(lang === 'fr' ? 'fr-FR' : 'en-US').format(price);

  const selectedPlanData = plans.find(p => p.key === selectedPlan);

  // ── Step: polling ─────────────────────────────────────────────────────────

  if (step === 'polling') {
    return (
      <div className="max-w-md mx-auto px-4 py-24 flex flex-col items-center gap-6 text-center">
        <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
          <Loader2 className="w-10 h-10 text-primary animate-spin" />
        </div>
        <h2 className="text-xl font-semibold">{t('payment_pending')}</h2>
        <p className="text-muted-foreground text-sm">{t('payment_pending_detail')}</p>
        <div className="flex gap-1 mt-2">
          {[0, 1, 2].map(i => (
            <div key={i} className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: `${i * 0.2}s` }} />
          ))}
        </div>
      </div>
    );
  }

  // ── Step: success ─────────────────────────────────────────────────────────

  if (step === 'success') {
    return (
      <div className="max-w-md mx-auto px-4 py-24 flex flex-col items-center gap-6 text-center">
        <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center">
          <CheckCircle2 className="w-10 h-10 text-green-600" />
        </div>
        <h2 className="text-2xl font-bold text-green-700">{t('payment_success')}</h2>
        <p className="text-muted-foreground">{t('subscription_activated')}</p>
        <Button onClick={() => setStep('plans')} className="mt-4">
          {t('subscription')}
        </Button>
      </div>
    );
  }

  // ── Step: error ───────────────────────────────────────────────────────────

  if (step === 'error') {
    return (
      <div className="max-w-md mx-auto px-4 py-24 flex flex-col items-center gap-6 text-center">
        <div className="w-20 h-20 rounded-full bg-red-100 flex items-center justify-center">
          <XCircle className="w-10 h-10 text-red-500" />
        </div>
        <h2 className="text-2xl font-bold text-red-600">{t('payment_failed')}</h2>
        <p className="text-muted-foreground">{t('payment_failed_detail')}</p>
        <Button variant="outline" onClick={() => { setStep('plans'); setSelectedPlan(null); }}>
          <ArrowLeft className="w-4 h-4 mr-2" />{t('back_to_plans')}
        </Button>
      </div>
    );
  }

  // ── Step: payment form ────────────────────────────────────────────────────

  if (step === 'payment') {
    const isCard = paymentMethod === 'CARD';

    return (
      <div className="max-w-lg mx-auto px-4 py-10">
        <button
          onClick={() => { setStep('plans'); setPhoneError(''); }}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> {t('back_to_plans')}
        </button>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">{t('select_payment_method')}</CardTitle>
            {selectedPlanData && (
              <div className="flex items-center justify-between mt-2 py-3 px-4 bg-muted rounded-lg">
                <span className="font-medium capitalize">
                  {t(selectedPlan.toLowerCase())} Plan
                </span>
                <span className="font-bold text-primary">
                  {formatPrice(selectedPlanData.price)} XAF{' '}
                  <span className="text-xs font-normal text-muted-foreground">{t('per_month')}</span>
                </span>
              </div>
            )}
          </CardHeader>

          <CardContent className="space-y-4">
            {/* Sélecteur de méthode */}
            <div className="space-y-2">
              {paymentMethods.map((method) => {
                const isActive = paymentMethod === method.key;
                const label = lang === 'fr' ? method.label_fr : method.label_en;
                return (
                  <button
                    key={method.key}
                    type="button"
                    onClick={() => { setPaymentMethod(method.key); setPhoneError(''); }}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left ${
                      isActive ? method.activeColor : 'border-border hover:border-muted-foreground/40'
                    }`}
                  >
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${isActive ? 'border-current' : 'border-muted-foreground'}`}>
                      {isActive && <div className={`w-2 h-2 rounded-full ${method.dot}`} />}
                    </div>
                    <method.icon className="w-5 h-5 shrink-0" />
                    <span className="font-medium text-sm">{label}</span>
                  </button>
                );
              })}
            </div>

            {/* Formulaire carte — affiché immédiatement quand CARD est sélectionné */}
            {isCard && (
              <div className="pt-2 border-t">
                <Elements stripe={stripePromise}>
                  <StripeCardForm
                    plan={selectedPlan}
                    amount={selectedPlanData?.price ?? 0}
                    onSuccess={() => {
                      queryClient.invalidateQueries({ queryKey: ['my-subscription'] });
                      setStep('success');
                    }}
                    onError={(msg) => toast.error(msg)}
                  />
                </Elements>
              </div>
            )}

            {/* Champ téléphone pour Mobile Money */}
            {!isCard && paymentMethods.find(m => m.key === paymentMethod)?.needsPhone && (
              <div className="space-y-1">
                <Label htmlFor="phone">{t('phone_number')}</Label>
                <Input
                  id="phone"
                  type="tel"
                  placeholder={t('phone_placeholder')}
                  value={phone}
                  onChange={(e) => { setPhone(e.target.value); setPhoneError(''); }}
                  className={phoneError ? 'border-red-400' : ''}
                />
                {phoneError ? (
                  <p className="text-xs text-red-500 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" /> {phoneError}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">{t('phone_format_hint')}</p>
                )}
              </div>
            )}

            {/* Email recap + bouton submit pour Mobile Money uniquement */}
            {!isCard && (
              <>
                {user?.email && (
                  <p className="text-xs text-muted-foreground">
                    {lang === 'fr' ? 'Confirmation envoyée à' : 'Confirmation sent to'}{' '}
                    <span className="font-medium text-foreground">{user.email}</span>
                  </p>
                )}
                <Button
                  className="w-full h-12 text-base"
                  disabled={checkoutMutation.isPending || isRedirecting}
                  onClick={() => checkoutMutation.mutate()}
                >
                  {checkoutMutation.isPending || isRedirecting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      {isRedirecting ? t('redirecting_payment') : t('processing_payment')}
                    </>
                  ) : (
                    t('confirm_payment')
                  )}
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Step: plans (default) ─────────────────────────────────────────────────

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

      {/* ── Bannière abonnement ACTIF ── */}
      {activeSub?.status === 'ACTIVE' && (
        <Card className="mb-8 border-primary/30 bg-primary/5">
          <CardContent className="p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <p className="text-sm text-muted-foreground">{t('current_plan')}</p>
              <p className="text-xl font-bold text-primary capitalize">
                {t(activeSub.plan?.toLowerCase())}
              </p>
              {activeSub.endDate && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {t('sub_valid_until')} {new Date(activeSub.endDate).toLocaleDateString()}
                </p>
              )}
            </div>
            <div className="flex items-center gap-3">
              <Badge className="bg-primary text-primary-foreground">{t('active')}</Badge>
              {!showCancelConfirm ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:bg-destructive/10 text-xs"
                  onClick={() => setShowCancelConfirm(true)}
                >
                  {t('cancel_subscription')}
                </Button>
              ) : (
                <div className="flex items-center gap-2">
                  <p className="text-xs text-muted-foreground max-w-[180px]">{t('cancel_confirm_msg')}</p>
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={cancelMutation.isPending}
                    onClick={() => cancelMutation.mutate()}
                  >
                    {cancelMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : t('confirm_cancel')}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setShowCancelConfirm(false)}>
                    {t('back')}
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Bannière abonnement EXPIRÉ / ANNULÉ ── */}
      {activeSub && activeSub.status !== 'ACTIVE' && (
        <Card className="mb-8 border-amber-300 bg-amber-50">
          <CardContent className="p-5">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                <Clock className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="font-semibold text-amber-800">
                  {lang === 'fr'
                    ? `Votre abonnement ${t(activeSub.plan?.toLowerCase())} a ${activeSub.status === 'CANCELLED' ? 'été annulé' : 'expiré'}`
                    : `Your ${t(activeSub.plan?.toLowerCase())} plan has ${activeSub.status === 'CANCELLED' ? 'been cancelled' : 'expired'}`}
                </p>
                {activeSub.endDate && (
                  <p className="text-xs text-amber-600 mt-0.5">
                    {lang === 'fr' ? 'Depuis le' : 'Since'}{' '}
                    {new Date(activeSub.endDate).toLocaleDateString()}
                  </p>
                )}
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                className="flex-1 gap-2 bg-amber-600 hover:bg-amber-700 text-white"
                onClick={() => {
                  setSelectedPlan(activeSub.plan);
                  setPaymentMethod('ORANGE_MONEY');
                  setPhone('');
                  setPhoneError('');
                  setStep('payment');
                }}
              >
                <RefreshCw className="w-4 h-4" />
                {lang === 'fr' ? 'Reconduire mon abonnement actuel' : 'Renew my current plan'}
              </Button>
              <Button
                variant="outline"
                className="flex-1 gap-2 border-amber-400 text-amber-700 hover:bg-amber-100"
                onClick={() => plansRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              >
                <LayoutGrid className="w-4 h-4" />
                {lang === 'fr' ? 'Changer de plan' : 'Change plan'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Plan cards */}
      <div ref={plansRef} className="grid md:grid-cols-3 gap-6">
        {plans.map((plan) => {
          const isCurrentPlan = activeSub?.status === 'ACTIVE' && activeSub?.plan === plan.key;
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

                {/* Payment method preview icons */}
                <div className="flex gap-1.5 justify-center pt-1">
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-orange-100 text-orange-600 font-medium">Orange</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-600 font-medium">MTN</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-600 font-medium">Visa/MC</span>
                </div>

                <Button
                  className={`w-full h-11 ${
                    isCurrentPlan
                      ? 'bg-muted text-muted-foreground'
                      : 'bg-primary hover:bg-primary/90 text-primary-foreground'
                  }`}
                  disabled={isCurrentPlan || subLoading}
                  onClick={() => {
                    setSelectedPlan(plan.key);
                    setPaymentMethod('ORANGE_MONEY');
                    setPhone('');
                    setPhoneError('');
                    setStep('payment');
                  }}
                >
                  {isCurrentPlan ? t('current_plan') : t('choose_plan')}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Bandeau "Déjà abonné ?" — visible uniquement si non connecté */}
      {!isAuthenticated && (
        <div className="mt-10 flex flex-col items-center gap-3 py-6 border-t">
          <p className="text-sm text-muted-foreground">
            {lang === 'fr' ? 'Vous avez déjà un abonnement ?' : 'Already have a subscription?'}
          </p>
          <Button variant="outline" className="gap-2" onClick={() => setLoginOpen(true)}>
            <LogIn className="w-4 h-4" />
            {lang === 'fr' ? 'Se connecter' : 'Log in'}
          </Button>
        </div>
      )}

      <LoginModal open={loginOpen} onOpenChange={setLoginOpen} />
    </div>
  );
}
