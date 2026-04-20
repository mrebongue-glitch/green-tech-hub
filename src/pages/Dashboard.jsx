import React from 'react';
import { adminApi } from '@/api/customBackendClient';
import { useQuery } from '@tanstack/react-query';
import { useLanguage } from '@/lib/LanguageContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Package, ShoppingCart, Users, DollarSign } from 'lucide-react';
import { format } from 'date-fns';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function Dashboard() {
  const { t, lang } = useLanguage();

  const { data: statsRes, isLoading } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: () => adminApi.stats(),
  });
  const stats = statsRes?.data;

  const formatPrice = (price) => new Intl.NumberFormat(lang === 'fr' ? 'fr-FR' : 'en-US').format(Number(price ?? 0));

  const statCards = stats ? [
    { label: t('total_products'),     value: stats.totalProducts,       icon: Package,      color: 'text-primary' },
    { label: t('total_orders'),       value: stats.totalOrders,         icon: ShoppingCart, color: 'text-blue-600' },
    { label: t('revenue'),            value: `${formatPrice(stats.totalRevenue)} XAF`, icon: DollarSign, color: 'text-green-600' },
    { label: t('active_subscribers'), value: stats.activeSubscriptions, icon: Users,        color: 'text-purple-600' },
  ] : [];

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-muted rounded w-48" />
          <div className="grid grid-cols-4 gap-4">
            {Array(4).fill(0).map((_, i) => <div key={i} className="h-28 bg-muted rounded" />)}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      <h1 className="text-3xl font-bold text-foreground mb-8">{t('dashboard')}</h1>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {statCards.map((stat, i) => (
          <Card key={i}>
            <CardContent className="p-6 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                <stat.icon className={`w-6 h-6 ${stat.color}`} />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{stat.label}</p>
                <p className="text-2xl font-bold text-foreground">{stat.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Chart + Recent Orders */}
      <div className="grid lg:grid-cols-2 gap-8">
        <Card>
          <CardHeader>
            <CardTitle>{lang === 'fr' ? 'Produits par catégorie' : 'Products by category'}</CardTitle>
          </CardHeader>
          <CardContent>
            {stats?.categoryDistribution?.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={stats.categoryDistribution}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="count" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-muted-foreground text-center py-12">{t('no_products')}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{lang === 'fr' ? 'Commandes récentes' : 'Recent orders'}</CardTitle>
          </CardHeader>
          <CardContent>
            {stats?.recentOrders?.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Client</TableHead>
                    <TableHead className="text-xs">{t('total')}</TableHead>
                    <TableHead className="text-xs">{t('status')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stats.recentOrders.map(order => (
                    <TableRow key={order.id}>
                      <TableCell className="text-sm">{order.user?.fullName ?? order.user?.email}</TableCell>
                      <TableCell className="text-sm font-medium">{formatPrice(order.totalAmount)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs capitalize">
                          {t(order.status?.toLowerCase())}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-muted-foreground text-center py-12">
                {lang === 'fr' ? 'Aucune commande' : 'No orders'}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
