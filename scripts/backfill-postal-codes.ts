/**
 * Backfills Customer.postalCode by extracting a 5-digit postal code from
 * each customer's existing free-text address. Dry-run by default — prints
 * what it would change without writing. Pass --commit to actually save.
 *
 * Safe to re-run: only touches customers where postalCode is currently
 * empty, so it never overwrites a postal code that's already been set
 * (manually corrected or previously backfilled).
 */
import { PrismaClient } from '@prisma/client';
import { extractPostalCode } from '../src/lib/postal-code';

const DRY_RUN = !process.argv.includes('--commit');
const prisma = new PrismaClient();

async function main() {
  console.log(DRY_RUN ? '\n=== DRY RUN — no writes will happen ===\n' : '\n=== COMMIT MODE — writing to Neon ===\n');

  const customers = await prisma.customer.findMany({
    where: { OR: [{ postalCode: null }, { postalCode: '' }] },
    select: { id: true, name: true, address: true },
  });

  let found = 0;
  let notFound = 0;

  for (const c of customers) {
    const postalCode = extractPostalCode(c.address);
    if (postalCode) {
      found++;
      console.log(`✓ ${c.name}: ${postalCode}  (from: "${c.address}")`);
      if (!DRY_RUN) {
        await prisma.customer.update({ where: { id: c.id }, data: { postalCode } });
      }
    } else {
      notFound++;
    }
  }

  console.log(`\n${found} postal code(s) found and ${DRY_RUN ? 'would be' : 'were'} saved.`);
  console.log(`${notFound} customer(s) have no address, or no 5-digit code in it — needs manual entry.`);
  console.log(DRY_RUN ? '\n(DRY RUN — review this, then re-run with --commit.)\n' : '\n(COMMIT — saved to Neon.)\n');

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('Backfill failed:', err);
  await prisma.$disconnect();
  process.exit(1);
});
