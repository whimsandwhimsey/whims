'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Truck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { formatCurrency } from '@/lib/utils';
import { createInvoice } from '../../invoices/actions';

type InvoiceType = 'DEPOSIT' | 'FINAL_PAYMENT' | 'READY_STOCK';
type DpType = 'PERCENTAGE' | 'FIXED_PER_BOOK' | 'FIXED_TOTAL' | null;

const PO_TYPES = ['PO_REGULAR', 'PO_REMAINDER'];

const COURIER_LABELS: Record<string, string> = {
  LION: 'Lion Parcel',
  OJEK: 'Ojek (Gojek/Grab)',
  SHOPEE: 'Shopee Express',
  JNE: 'JNE',
  JNT: 'J&T Express',
  SICEPAT: 'SiCepat',
  ANTERAJA: 'AnterAja',
  WAHANA: 'Wahana',
  NINJA: 'Ninja Xpress',
  IDEXPRESS: 'ID Express',
  SENTRAL: 'Sentral Cargo',
};

const BITESHIP_CODE_TO_ENUM: Record<string, string> = {
  jne: 'JNE',
  jnt: 'JNT',
  sicepat: 'SICEPAT',
  anteraja: 'ANTERAJA',
  lion: 'LION',
  wahana: 'WAHANA',
  ninja: 'NINJA',
  idexpress: 'IDEXPRESS',
};

type Rate = { courierCode: string; courierName: string; serviceName: string; duration: string; price: number };

function computeDpAmount(dpType: DpType, dpValue: number | null, totalAmount: number, totalQuantity: number): number {
  if (!dpType || dpValue === null) return Math.round(totalAmount * 0.25);
  if (dpType === 'PERCENTAGE') return Math.round(totalAmount * (dpValue / 100));
  if (dpType === 'FIXED_PER_BOOK') return Math.round(dpValue * totalQuantity);
  return Math.round(Math.min(dpValue, totalAmount));
}

export function CreateInvoiceForm({
  orderId,
  orderType,
  totalAmount,
  totalQuantity,
  dpType,
  dpValue,
  alreadyInvoiced,
}: {
  orderId: string;
  orderType: string;
  totalAmount: number;
  totalQuantity: number;
  dpType: DpType;
  dpValue: number | null;
  alreadyInvoiced: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const isPoType = PO_TYPES.includes(orderType);
  const remainingToInvoice = Math.max(0, Math.round(totalAmount - alreadyInvoiced));

  const initialType: InvoiceType = !isPoType ? 'READY_STOCK' : alreadyInvoiced === 0 ? 'DEPOSIT' : 'FINAL_PAYMENT';
  const initialAmount = !isPoType
    ? remainingToInvoice
    : alreadyInvoiced === 0
      ? computeDpAmount(dpType, dpValue, totalAmount, totalQuantity)
      : remainingToInvoice;

  const [type, setType] = useState<InvoiceType>(initialType);
  const [amount, setAmount] = useState(String(initialAmount));

  // Bundle ongkir into this same bill — separate Shipment record
  // underneath, but shown to the customer as one combined total.
  const [includeOngkir, setIncludeOngkir] = useState(false);
  const [ongkirCourier, setOngkirCourier] = useState('LION');
  const [ongkirCost, setOngkirCost] = useState('0');
  const [ratesLoading, setRatesLoading] = useState(false);
  const [rates, setRates] = useState<Rate[] | null>(null);
  const [rateError, setRateError] = useState<string | null>(null);

  function handleTypeChange(next: InvoiceType) {
    setType(next);
    if (next === 'DEPOSIT') {
      setAmount(String(computeDpAmount(dpType, dpValue, totalAmount, totalQuantity)));
    } else {
      setAmount(String(remainingToInvoice));
    }
  }

  function checkRates() {
    setRatesLoading(true);
    setRateError(null);
    setRates(null);
    fetch(`/api/shipping/rates?orderId=${orderId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setRateError(data.error);
          return;
        }
        setRates(data.rates);
      })
      .catch(() => setRateError('Gagal ambil rate ongkir.'))
      .finally(() => setRatesLoading(false));
  }

  function pickRate(r: Rate) {
    const enumCode = BITESHIP_CODE_TO_ENUM[r.courierCode];
    if (enumCode) setOngkirCourier(enumCode);
    setOngkirCost(String(r.price));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createInvoice({
        orderId,
        type,
        amount: Number(amount),
        ongkir: includeOngkir ? { courier: ongkirCourier as any, shippingCost: Number(ongkirCost) } : undefined,
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      router.push(`/admin/invoices/${result.invoiceId}`);
    });
  }

  if (!open) {
    return (
      <Button size="sm" onClick={() => setOpen(true)} className="w-full sm:w-auto">
        Create invoice
      </Button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-md border border-border p-4">
      {isPoType && type === 'DEPOSIT' && (
        <p className="text-xs text-brass">
          Amount prefilled from this order&apos;s DP rule ({dpType ? dpType.toLowerCase().replace('_', ' ') : 'default 25%'}) — feel free to adjust.
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="invoiceType">Type</Label>
          <Select
            id="invoiceType"
            value={type}
            onChange={(e) => handleTypeChange(e.target.value as InvoiceType)}
          >
            {isPoType && <option value="DEPOSIT">Deposit (DP)</option>}
            {isPoType && <option value="FINAL_PAYMENT">Final Payment (Pelunasan)</option>}
            {!isPoType && <option value="READY_STOCK">Full payment</option>}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="invoiceAmount">Amount (buku)</Label>
          <Input
            id="invoiceAmount"
            type="number"
            min="1"
            step="1"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={includeOngkir}
          onChange={(e) => setIncludeOngkir(e.target.checked)}
          className="h-4 w-4 rounded border-input"
        />
        Sekalian tagih ongkir di invoice ini
      </label>

      {includeOngkir && (
        <div className="space-y-3 rounded-md bg-secondary/50 p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="ongkirCourier">Kurir</Label>
              <Select id="ongkirCourier" value={ongkirCourier} onChange={(e) => setOngkirCourier(e.target.value)}>
                {Object.entries(COURIER_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ongkirCost">Ongkir (Rp)</Label>
              <Input
                id="ongkirCost"
                type="number"
                min="0"
                step="500"
                value={ongkirCost}
                onChange={(e) => setOngkirCost(e.target.value)}
              />
            </div>
          </div>

          <Button type="button" size="sm" variant="outline" onClick={checkRates} disabled={ratesLoading}>
            <Truck className="h-4 w-4" /> {ratesLoading ? 'Cek ongkir…' : 'Cek ongkir (rekomendasi)'}
          </Button>

          {rateError && <p className="text-xs text-destructive">{rateError}</p>}
          {rates && rates.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {rates
                .sort((a, b) => a.price - b.price)
                .map((r) => (
                  <button
                    key={`${r.courierCode}-${r.serviceName}`}
                    type="button"
                    onClick={() => pickRate(r)}
                    className="rounded-full border border-border bg-card px-2.5 py-1 text-xs hover:border-primary"
                  >
                    {r.courierName} {r.serviceName} · {formatCurrency(r.price)} · {r.duration}
                  </button>
                ))}
            </div>
          )}
          {rates && rates.length === 0 && !rateError && (
            <p className="text-xs text-muted-foreground">Gak ada rekomendasi — isi manual aja di atas.</p>
          )}
          <p className="text-xs text-muted-foreground">
            Total gabungan buku + ongkir:{' '}
            <span className="font-medium text-foreground">
              {formatCurrency(Number(amount || 0) + Number(ongkirCost || 0))}
            </span>
            . Resi diisi belakangan pas packing.
          </p>
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={isPending} className="flex-1 sm:flex-none">
          {isPending ? 'Creating…' : 'Create & view'}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
