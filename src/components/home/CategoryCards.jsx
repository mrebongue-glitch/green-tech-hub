import React from 'react';
import { Link } from 'react-router-dom';
import { useLanguage } from '@/lib/LanguageContext';
import { Card, CardContent } from '@/components/ui/card';
import { Monitor, Printer, Gamepad2, Tv, ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';

const categories = [
  {
    key: 'informatique',
    icon: Monitor,
    image: 'https://images.unsplash.com/photo-1496181133206-80ce9b88a853?w=600&q=80',
    desc_fr: 'Ordinateurs, imprimantes, disques durs, smartphones & accessoires',
    desc_en: 'Computers, printers, hard drives, smartphones & accessories',
  },
  {
    key: 'services',
    icon: Printer,
    image: 'https://images.unsplash.com/photo-1586281380349-632531db7ed4?w=600&q=80',
    desc_fr: 'Saisie, photocopie, photographie, scanner, impression',
    desc_en: 'Typing, photocopying, photography, scanning, printing',
  },
  {
    key: 'jeux_video',
    icon: Gamepad2,
    image: 'https://images.unsplash.com/photo-1606144042614-b2417e99c4e3?w=600&q=80',
    desc_fr: 'PlayStation, Nintendo & plus encore',
    desc_en: 'PlayStation, Nintendo & more',
  },
  {
    key: 'televiseurs',
    icon: Tv,
    image: 'https://images.unsplash.com/photo-1593359677879-a4bb92f829d1?w=600&q=80',
    desc_fr: 'Smart TV, écrans 4K et téléviseurs dernière génération',
    desc_en: 'Smart TVs, 4K screens and latest generation televisions',
  },
];

export default function CategoryCards() {
  const { t, lang } = useLanguage();

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 py-16">
      <div className="text-center mb-12">
        <h2 className="text-3xl font-bold text-foreground">{t('our_categories')}</h2>
        <div className="w-16 h-1 bg-primary rounded-full mx-auto mt-4" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {categories.map((cat, i) => (
          <motion.div
            key={cat.key}
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: i * 0.1 }}
          >
            <Link to={`/catalog?category=${cat.key}`}>
              <Card className="group overflow-hidden hover:shadow-2xl transition-all duration-500 hover:-translate-y-2 border bg-card">
                <div className="aspect-[3/2] overflow-hidden relative">
                  <img
                    src={cat.image}
                    alt={t(cat.key)}
                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                  <div className="absolute bottom-4 left-4 right-4">
                    <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center mb-2">
                      <cat.icon className="w-5 h-5 text-white" />
                    </div>
                    <h3 className="font-bold text-white text-lg">{t(cat.key)}</h3>
                  </div>
                </div>
                <CardContent className="p-4">
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {lang === 'fr' ? cat.desc_fr : cat.desc_en}
                  </p>
                  <div className="flex items-center gap-1 mt-3 text-primary text-sm font-medium group-hover:gap-2 transition-all">
                    {t('explore')} <ArrowRight className="w-3.5 h-3.5" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          </motion.div>
        ))}
      </div>
    </section>
  );
}