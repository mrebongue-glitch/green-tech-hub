import React, { useState } from 'react';
import { ordersApi } from '@/api/customBackendClient';
import { useQuery } from '@tanstack/react-query';
import { useLanguage } from '@/lib/LanguageContext';
import { useAuth } from '@/lib/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { FileText, Printer, Package } from 'lucide-react';
import { format } from 'date-fns';

const statusColors = {
  PENDING:    'bg-yellow-100 text-yellow-800 border-yellow-200',
  CONFIRMED:  'bg-blue-100 text-blue-800 border-blue-200',
  PROCESSING: 'bg-blue-100 text-blue-800 border-blue-200',
  SHIPPED:    'bg-purple-100 text-purple-800 border-purple-200',
  DELIVERED:  'bg-green-100 text-green-800 border-green-200',
  CANCELLED:  'bg-red-100 text-red-800 border-red-200',
  REFUNDED:   'bg-gray-100 text-gray-800 border-gray-200',
};

const paymentColors = {
  PAID:               'bg-green-100 text-green-800 border-green-200',
  UNPAID:             'bg-orange-100 text-orange-800 border-orange-200',
  REFUNDED:           'bg-gray-100 text-gray-800 border-gray-200',
  PARTIALLY_REFUNDED: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  FAILED:             'bg-red-100 text-red-800 border-red-200',
};

export default function Orders() {
  const { t, lang } = useLanguage();
  const { isAuthenticated } = useAuth();
  const [selected, setSelected] = useState(null);

  const { data: ordersRes, isLoading } = useQuery({
    queryKey: ['my-orders'],
    queryFn: () => ordersApi.list(),
    enabled: isAuthenticated,
  });
  const orders = ordersRes?.data ?? [];

  const formatPrice = (price) => new Intl.NumberFormat(lang === 'fr' ? 'fr-FR' : 'en-US').format(Number(price));

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-48" />
          {Array(3).fill(0).map((_, i) => <div key={i} className="h-16 bg-muted rounded" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      <h1 className="text-3xl font-bold text-foreground mb-8">{t('orders')}</h1>

      {orders.length === 0 ? (
        <div className="text-center py-20">
          <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mx-auto mb-6">
            <Package className="w-10 h-10 text-muted-foreground" />
          </div>
          <p className="text-muted-foreground text-lg">
            {lang === 'fr' ? 'Aucune commande pour le moment.' : 'No orders yet.'}
          </p>
        </div>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('order_number')}</TableHead>
                  <TableHead>{t('date')}</TableHead>
                  <TableHead>{t('total')}</TableHead>
                  <TableHead>{t('status')}</TableHead>
                  <TableHead>{t('payment_status')}</TableHead>
                  <TableHead>{t('actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map(order => (
                  <TableRow key={order.id}>
                    <TableCell className="font-mono text-xs">#{order.orderNumber ?? order.id?.slice(0, 8)}</TableCell>
                    <TableCell className="text-sm">
                      {format(new Date(order.createdAt), 'dd/MM/yyyy')}
                    </TableCell>
                    <TableCell className="font-semibold">{formatPrice(order.totalAmount)} XAF</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={statusColors[order.status]}>
                        {t(order.status?.toLowerCase())}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={paymentColors[order.paymentStatus]}>
                        {t(order.paymentStatus?.toLowerCase())}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => setSelected(order)}>
                        <FileText className="w-3.5 h-3.5" /> {t('view')}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {/* Invoice Dialog */}
      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        <DialogContent className="max-w-lg print:shadow-none">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary" />
              {t('invoice')} — #{selected?.orderNumber ?? selected?.id?.slice(0, 8)}
            </DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4" id="invoice-content">
              <div className="flex justify-between text-sm">
                <div>
                  <p className="font-semibold">Green Market Technology</p>
                  <p className="text-muted-foreground italic text-xs">{t('slogan')}</p>
                </div>
                <div className="text-right">
                  <p className="text-muted-foreground">{t('date')}</p>
                  <p className="font-medium">{format(new Date(selected.createdAt), 'dd/MM/yyyy HH:mm')}</p>
                </div>
              </div>

              <Separator />

              <div className="text-sm">
                <p className="text-muted-foreground">{lang === 'fr' ? 'Client' : 'Customer'}</p>
                <p className="font-medium">{selected.user?.fullName}</p>
                <p className="text-muted-foreground">{selected.user?.email}</p>
              </div>

              <Separator />

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">{lang === 'fr' ? 'Article' : 'Item'}</TableHead>
                    <TableHead className="text-xs">{t('quantity')}</TableHead>
                    <TableHead className="text-xs">{t('unit_price')}</TableHead>
                    <TableHead className="text-xs text-right">{t('total')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selected.items?.map((item, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="text-sm">{item.nameSnapshot}</TableCell>
                      <TableCell className="text-sm">{item.quantity}</TableCell>
                      <TableCell className="text-sm">{formatPrice(item.unitPrice)}</TableCell>
                      <TableCell className="text-sm text-right font-medium">
                        {formatPrice(Number(item.unitPrice) * item.quantity)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <Separator />

              <div className="flex justify-between items-center">
                <span className="font-bold text-lg">{t('total')}</span>
                <span className="text-2xl font-extrabold text-primary">
                  {formatPrice(selected.totalAmount)} {selected.currency || 'XAF'}
                </span>
              </div>

              <Button className="w-full gap-2" variant="outline" onClick={() => window.print()}>
                <Printer className="w-4 h-4" /> {t('print_invoice')}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
