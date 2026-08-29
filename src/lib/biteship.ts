/**
 * Thin wrapper around Biteship's "Rates by Postal Code" endpoint.
 * https://biteship.com/en/docs/api/rates/retrieve
 *
 * Needs BITESHIP_API_KEY and STORE_ORIGIN_POSTAL_CODE in .env — if either
 * is missing, getShippingRates throws a clear error the UI can display
 * instead of a cryptic fetch failure.
 */

export type ShippingRate = {
  courierCode: string;
  courierName: string;
  serviceCode: string;
  serviceName: string;
  duration: string;
  price: number;
};

const COURIERS = 'jne,jnt,sicepat,anteraja,lion,wahana,ninja,idexpress';

export async function getShippingRates(params: {
  destinationPostalCode: string;
  weightGrams: number;
  itemValue: number;
  itemName?: string;
}): Promise<ShippingRate[]> {
  const apiKey = process.env.BITESHIP_API_KEY;
  const originPostalCode = process.env.STORE_ORIGIN_POSTAL_CODE;

  if (!apiKey) throw new Error('BITESHIP_API_KEY belum diset di .env');
  if (!originPostalCode) throw new Error('STORE_ORIGIN_POSTAL_CODE belum diset di .env');
  if (!params.destinationPostalCode) throw new Error('Customer belum punya kode pos.');

  const packagingWeight = Number(process.env.PACKAGING_WEIGHT_GRAMS ?? '100');
  const totalWeight = Math.max(1, params.weightGrams + packagingWeight);

  const res = await fetch('https://api.biteship.com/v1/rates/couriers', {
    method: 'POST',
    headers: {
      authorization: apiKey,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      origin_postal_code: Number(originPostalCode),
      destination_postal_code: Number(params.destinationPostalCode),
      couriers: COURIERS,
      items: [
        {
          name: params.itemName || 'Buku',
          value: params.itemValue,
          weight: totalWeight,
          quantity: 1,
        },
      ],
    }),
  });

  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data?.error ?? `Biteship error (${res.status})`);
  }

  return (data.pricing ?? []).map((p: any) => ({
    courierCode: p.courier_code,
    courierName: p.courier_name,
    serviceCode: p.courier_service_code,
    serviceName: p.courier_service_name,
    duration: p.duration,
    price: p.price,
  }));
}
