import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { authApi } from '@/api/customBackendClient';
import { useAuth } from '@/lib/AuthContext';
import { useLanguage } from '@/lib/LanguageContext';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, LogIn, Eye, EyeOff } from 'lucide-react';

export default function LoginModal({ open, onOpenChange }) {
  const { checkAppState } = useAuth();
  const { lang } = useLanguage();
  const queryClient = useQueryClient();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await authApi.login(email, password);
      await checkAppState();
      queryClient.invalidateQueries({ queryKey: ['my-subscription'] });
      onOpenChange(false);
      setEmail('');
      setPassword('');
    } catch (err) {
      setError(
        err.message === 'Invalid credentials' || err.status === 401
          ? lang === 'fr' ? 'Email ou mot de passe incorrect' : 'Invalid email or password'
          : err.message ?? (lang === 'fr' ? 'Erreur de connexion' : 'Login error')
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LogIn className="w-5 h-5 text-primary" />
            {lang === 'fr' ? 'Se connecter' : 'Log in'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label htmlFor="login-email">Email</Label>
            <Input
              id="login-email"
              type="email"
              autoComplete="email"
              placeholder="votre@email.com"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError(''); }}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="login-password">
              {lang === 'fr' ? 'Mot de passe' : 'Password'}
            </Label>
            <div className="relative">
              <Input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(''); }}
                required
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
          )}

          <Button type="submit" className="w-full h-11" disabled={loading}>
            {loading
              ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{lang === 'fr' ? 'Connexion...' : 'Logging in...'}</>
              : lang === 'fr' ? 'Se connecter' : 'Log in'
            }
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
