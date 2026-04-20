import React from 'react';
import { Link } from 'react-router-dom';
import { useLanguage } from '@/lib/LanguageContext';
import { Button } from '@/components/ui/button';
import { ArrowRight, Leaf, Shield, Truck, Headphones } from 'lucide-react';
import { motion } from 'framer-motion';

export default function HeroSection() {
  const { t } = useLanguage();

  const features = [
    { icon: Shield, label: { fr: 'Paiement sécurisé', en: 'Secure payment' } },
    { icon: Truck, label: { fr: 'Livraison rapide', en: 'Fast delivery' } },
    { icon: Headphones, label: { fr: 'Support 24/7', en: '24/7 Support' } },
  ];

  return (
    <section className="relative overflow-hidden">
      {/* Background Image with Overlay */}
      <div className="absolute inset-0">
        <img 
          src="https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=1920&q=80" 
          alt="Technology background"
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-br from-background/95 via-background/90 to-primary/20" />
      </div>
      
      {/* Decorative elements */}
      <div className="absolute top-20 right-10 w-72 h-72 bg-primary/10 rounded-full blur-3xl" />
      <div className="absolute bottom-10 left-10 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-16 sm:py-24 lg:py-32 relative">
        <div className="max-w-2xl">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-2xl bg-primary flex items-center justify-center">
                <Leaf className="w-6 h-6 text-primary-foreground" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-foreground tracking-tight">Green Market Technology</h2>
              </div>
            </div>

            <p className="text-primary font-medium text-sm tracking-wide uppercase mb-4 border-l-2 border-primary pl-3">
              {t('slogan')}
            </p>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-foreground leading-tight tracking-tight">
              {t('hero_title')}
            </h1>

            <p className="mt-6 text-lg text-muted-foreground leading-relaxed max-w-xl">
              {t('hero_subtitle')}
            </p>

            <div className="mt-8 flex flex-col sm:flex-row gap-3">
              <Link to="/catalog">
                <Button size="lg" className="bg-primary hover:bg-primary/90 text-primary-foreground px-8 h-12 text-base gap-2">
                  {t('explore')}
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
              <Link to="/subscription">
                <Button size="lg" variant="outline" className="h-12 text-base px-8">
                  {t('subscribe')}
                </Button>
              </Link>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.3 }}
            className="mt-12 flex flex-wrap gap-6"
          >
            {features.map((feat, i) => (
              <div key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <feat.icon className="w-4 h-4 text-primary" />
                </div>
                <span>{feat.label.fr}</span>
              </div>
            ))}
          </motion.div>
        </div>
      </div>
    </section>
  );
}