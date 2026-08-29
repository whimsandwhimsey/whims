'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Truck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { formatCurrency } from '@/lib/utils';
import { saveShippingInfo } from './actions';

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
};

// Maps Biteship's lowercase courier_code back to our enum.
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

type Rate = {
  courierCode: string;
  courierName: string;
  serviceCode: string;
  serviceName: string;
  duration: string;
  price: number;
};

export function ShippingForm({
  orderId,
  initialCourier,
  initialTracking,
}: {
  orderId: string;
  initialCourier: string | null;
  initialTracking: string | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [courier, setCourier] = useState(initialCourier ?? '');

  const [ratesLoading, setRatesLoading] = useState(false);
  const [rates, setRates] = useState<Rate[] | null>(null);
  const [rateError, setRateError] = useState<string | null>(null);

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

  function handleSubmit(formData: FormData) {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await saveShippingInfo(orderId, formData);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <form action={handleSubmit} className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Select
          name="courier"
          value={courier}
          onChange={(e) => setCourier(e.target.value)}
          className="sm:w-40"
          required
        >
          <option value="" disabled>
            Courier…
          </option>
          {Object.entries(COURIER_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
        <Input
          name="trackingNumber"
          placeholder="Tracking / resi number"
          defaultValue={initialTracking ?? ''}
          className="sm:w-48"
          required
        />
        <Button type="submit" size="sm" disabled={isPending} className="shrink-0">
          {isPending ? 'Saving…' : 'Save'}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={checkRates} disabled={ratesLoading} className="shrink-0">
          <Truck className="h-4 w-4" /> {ratesLoading ? 'Cek ongkir…' : 'Cek ongkir'}
        </Button>
        {saved && !error && <span className="text-xs text-success">Saved ✓</span>}
        {error && <span className="text-xs text-destructive">{error}</span>}
      </form>

      {rateError && <p className="text-xs text-destructive">{rateError}</p>}

      {rates && rates.length > 0 && (
        <div className="rounded-md border border-border p-2">
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">
            Pilih kurir buat isi otomatis field di atas:
          </p>
          <div className="flex flex-wrap gap-1.5">
            {rates
              .sort((a, b) => a.price - b.price)
              .map((r) => (
                <button
                  key={`${r.courierCode}-${r.serviceCode}`}
                  type="button"
                  onClick={() => setCourier(BITESHIP_CODE_TO_ENUM[r.courierCode] ?? '')}
                  className="rounded-full border border-border bg-secondary px-2.5 py-1 text-xs hover:border-primary"
                >
                  {r.courierName} {r.serviceName} · {formatCurrency(r.price)} · {r.duration}
                </button>
              ))}
          </div>
        </div>
      )}
      {rates && rates.length === 0 && !rateError && (
        <p className="text-xs text-muted-foreground">Gak ada kurir yang bisa ngirim ke alamat ini.</p>
      )}
    </div>
  );
}
