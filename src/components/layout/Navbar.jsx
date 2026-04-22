import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useLanguage } from '@/lib/LanguageContext';
import { useCart } from '@/lib/CartContext';
import { useAuth } from '@/lib/AuthContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import {
  ShoppingCart, Menu, Globe, Home, Package, FileText,
  LayoutDashboard, CreditCard, LogOut, Leaf, LogIn,
} from 'lucide-react';
import LoginModal from '@/components/auth/LoginModal';

const navLinks = [
  { key: 'home',         path: '/',            icon: Home },
  { key: 'catalog',      path: '/catalog',      icon: Package },
  { key: 'subscription', path: '/subscription', icon: CreditCard },
  { key: 'orders',       path: '/orders',       icon: FileText },
];

export default function Navbar() {
  const { t, lang, toggleLang } = useLanguage();
  const { totalItems } = useCart();
  const { user, isAuthenticated, logout } = useAuth();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);

  const isActive = (path) => location.pathname === path;

  const NavLinks = ({ mobile }) => (
    <div className={mobile ? 'flex flex-col gap-1' : 'hidden lg:flex items-center gap-1'}>
      {navLinks.map(({ key, path, icon: Icon }) => (
        <Link key={key} to={path} onClick={() => mobile && setOpen(false)}>
          <Button
            variant={isActive(path) ? 'default' : 'ghost'}
            size={mobile ? 'default' : 'sm'}
            className={`${mobile ? 'w-full justify-start' : ''} ${isActive(path) ? '' : 'text-foreground/70 hover:text-foreground'}`}
          >
            <Icon className="w-4 h-4 mr-2" />
            {t(key)}
          </Button>
        </Link>
      ))}
      {user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN' ? (
        <Link to="/dashboard" onClick={() => mobile && setOpen(false)}>
          <Button
            variant={isActive('/dashboard') ? 'default' : 'ghost'}
            size={mobile ? 'default' : 'sm'}
            className={mobile ? 'w-full justify-start' : ''}
          >
            <LayoutDashboard className="w-4 h-4 mr-2" />
            {t('dashboard')}
          </Button>
        </Link>
      ) : null}
    </div>
  );

  return (
    <header className="sticky top-0 z-50 bg-card/80 backdrop-blur-xl border-b">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 shrink-0">
            <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center">
              <Leaf className="w-5 h-5 text-primary-foreground" />
            </div>
            <div className="hidden sm:block">
              <span className="font-bold text-foreground text-sm tracking-tight">Green Market</span>
              <span className="font-light text-primary text-sm ml-1">Technology</span>
            </div>
          </Link>

          {/* Desktop Nav */}
          <NavLinks />

          {/* Right actions */}
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={toggleLang} className="text-xs font-semibold">
              <Globe className="w-4 h-4" />
              <span className="sr-only">{lang === 'fr' ? 'EN' : 'FR'}</span>
            </Button>
            <span className="text-xs font-bold text-muted-foreground">{lang.toUpperCase()}</span>

            <Link to="/cart">
              <Button variant="ghost" size="icon" className="relative">
                <ShoppingCart className="w-5 h-5" />
                {totalItems > 0 && (
                  <Badge className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-[10px] bg-primary text-primary-foreground">
                    {totalItems}
                  </Badge>
                )}
              </Button>
            </Link>

            {isAuthenticated ? (
              <Button variant="ghost" size="icon" onClick={() => logout()} title={t('logout')}>
                <LogOut className="w-4 h-4" />
              </Button>
            ) : (
              <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => setLoginOpen(true)}>
                <LogIn className="w-4 h-4" />
                <span className="hidden sm:inline">{t('login')}</span>
              </Button>
            )}

            {/* Mobile menu */}
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="lg:hidden">
                  <Menu className="w-5 h-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 p-6">
                <div className="flex items-center gap-2 mb-8">
                  <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center">
                    <Leaf className="w-5 h-5 text-primary-foreground" />
                  </div>
                  <div>
                    <span className="font-bold text-sm">Green Market</span>
                    <span className="font-light text-primary text-sm ml-1">Technology</span>
                  </div>
                </div>
                <NavLinks mobile />
                {!isAuthenticated && (
                  <Button variant="outline" className="w-full mt-4 gap-2" onClick={() => { setLoginOpen(true); setOpen(false); }}>
                    <LogIn className="w-4 h-4" /> {t('login')}
                  </Button>
                )}
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>
      <LoginModal open={loginOpen} onOpenChange={setLoginOpen} />
    </header>
  );
}
