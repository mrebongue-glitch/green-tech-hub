import React from 'react';
import { Outlet } from 'react-router-dom';
import Navbar from './Navbar';
import { useLanguage } from '@/lib/LanguageContext';

export default function AppLayout() {
  const { t } = useLanguage();

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      <main className="flex-1">
        <Outlet />
      </main>
      <footer className="border-t bg-card/50 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="text-center md:text-left">
              <p className="font-semibold text-foreground">Green Market Technology</p>
              <p className="text-sm text-muted-foreground italic mt-1">{t('slogan')}</p>
            </div>
            <p className="text-xs text-muted-foreground">
              © {new Date().getFullYear()} Green Market Technology. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}