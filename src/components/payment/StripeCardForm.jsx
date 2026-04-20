import React, { useState } from 'react';
import {
  useStripe,
  useElements,
  CardNumberElement,
  CardExpiryElement,
  CardCvcElement,
} from '@stripe/react-stripe-js';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Loader2, ShieldCheck, CreditCard } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';

const ELEMENT_STYLE = {
  base: {
    fontSize: '15px',
    color: '#111827',
    fontFamily: 'ui-sans-serif, system-ui, sans-serif',
    fontSmoothing: 'antialiased',
    '::placeholder': { color: '#9ca3af' },
  },
  invalid: { color: '#ef4444', iconColor: '#ef4444' },
};

const BRANDS = ['visa', 'mastercard'];

export default function StripeCardForm({ clientSecret, amount, onSuccess, onError }) {
  const stripe = useStripe();
  const elements = useElements();
  const { lang } = useLanguage();

  const [loading, setLoading] = useState(false);
  const [brand, setBrand] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});

  const setFieldError = (field, msg) =>
    setFieldErrors((prev) => ({ ...prev, [field]: msg || null }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    setLoading(true);
    setFieldErrors({});

    const cardNumber = elements.getElement(CardNumberElement);

    const { error, paymentIntent } = await stripe.confirmCardPayment(clientSecret, {
      payment_method: { card: cardNumber },
    });

    setLoading(false);

    if (error) {
      // Stripe localise déjà le message (FR si navigator.language=fr)
      onError(error.message ?? (lang === 'fr' ? 'Paiement refusé' : 'Payment declined'));
    } else if (paymentIntent?.status === 'succeeded') {
      onSuccess();
    }
  };

  const fieldClass =
    'border rounded-lg px-3 py-3 bg-white focus-within:ring-2 focus-within:ring-primary/30 transition-shadow';

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Brand indicators */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground mr-1">
          {lang === 'fr' ? 'Accepté :' : 'Accepted:'}
        </span>
        {BRANDS.map((b) => (
          <span
            key={b}
            className={`px-3 py-1 rounded-md border text-xs font-bold uppercase transition-all ${
              brand === b
                ? b === 'visa'
                  ? 'border-blue-500 bg-blue-50 text-blue-700 shadow-sm'
                  : 'border-orange-400 bg-orange-50 text-orange-700 shadow-sm'
                : 'border-border text-muted-foreground'
            }`}
          >
            {b === 'mastercard' ? 'Mastercard' : 'Visa'}
          </span>
        ))}
        {brand && !BRANDS.includes(brand) && (
          <span className="px-3 py-1 rounded-md border border-border text-xs font-bold uppercase text-foreground">
            {brand}
          </span>
        )}
      </div>

      {/* Card number */}
      <div className="space-y-1.5">
        <Label className="flex items-center gap-1.5">
          <CreditCard className="w-3.5 h-3.5" />
          {lang === 'fr' ? 'Numéro de carte' : 'Card number'}
        </Label>
        <div className={fieldClass}>
          <CardNumberElement
            options={{ style: ELEMENT_STYLE, showIcon: true }}
            onChange={(e) => {
              setBrand(e.brand !== 'unknown' ? e.brand : null);
              setFieldError('number', e.error?.message);
            }}
          />
        </div>
        {fieldErrors.number && (
          <p className="text-xs text-red-500">{fieldErrors.number}</p>
        )}
      </div>

      {/* Expiry + CVC */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>{lang === 'fr' ? "Date d'expiration" : 'Expiry date'}</Label>
          <div className={fieldClass}>
            <CardExpiryElement
              options={{ style: ELEMENT_STYLE }}
              onChange={(e) => setFieldError('expiry', e.error?.message)}
            />
          </div>
          {fieldErrors.expiry && (
            <p className="text-xs text-red-500">{fieldErrors.expiry}</p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label>CVV / CVC</Label>
          <div className={fieldClass}>
            <CardCvcElement
              options={{ style: ELEMENT_STYLE }}
              onChange={(e) => setFieldError('cvc', e.error?.message)}
            />
          </div>
          {fieldErrors.cvc && (
            <p className="text-xs text-red-500">{fieldErrors.cvc}</p>
          )}
        </div>
      </div>

      {/* Security notice */}
      <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/40 px-3 py-2 rounded-lg">
        <ShieldCheck className="w-3.5 h-3.5 text-green-500 mt-0.5 shrink-0" />
        {lang === 'fr'
          ? 'Paiement sécurisé par Stripe — vos données bancaires ne transitent jamais par nos serveurs.'
          : 'Secured by Stripe — your card data never touches our servers.'}
      </div>

      <Button
        type="submit"
        className="w-full h-12 text-base"
        disabled={loading || !stripe || !elements}
      >
        {loading ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            {lang === 'fr' ? 'Traitement...' : 'Processing...'}
          </>
        ) : (
          `${lang === 'fr' ? 'Payer' : 'Pay'} ${new Intl.NumberFormat(lang === 'fr' ? 'fr-FR' : 'en-US').format(amount)} XAF`
        )}
      </Button>
    </form>
  );
}
