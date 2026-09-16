/**
 * Strips spaces, dashes, and any other non-digit characters from every
 * customer's phone number in the NEW system (Neon) — e.g. "62 851-5788-8224"
 * becomes "6285157888224". Dry-run by default. Safe to re-run: only
 * updates customers whose phone actually changes after normalizing.
 */
import { PrismaClient } from '@prisma/client';

process.loadEnvFile();

const DRY_RUN = !process.argv.includes('--commit');
const prisma = new PrismaClient();

function normalize(phone: string): string {
  return phone.replace(/[^\d]/g, '');
}

async function main() {
  console.log(DRY_RUN ? '\n=== DRY RUN — no writes will happen ===\n' : '\n=== COMMIT MODE — writing to Neon ===\n');

  const customers = await prisma.customer.findMany({ select: { id: true, name: true, phone: true } });

  let changed = 0;
  for (const c of customers) {
    const cleaned = normalize(c.phone);
    if (cleaned !== c.phone) {
      console.log(`  ${c.name}: "${c.phone}" → "${cleaned}"`);
      changed++;
      if (!DRY_RUN) {
        await prisma.customer.update({ where: { id: c.id }, data: { phone: cleaned } });
      }
    }
  }

  console.log(`\n${changed} of ${customers.length} customer(s) ${DRY_RUN ? 'would be' : 'were'} updated.`);
  console.log(DRY_RUN ? '\n(DRY RUN — review this, then re-run with --commit.)\n' : '\n(COMMIT — saved to Neon.)\n');

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('Normalization failed:', err);
  await prisma.$disconnect();
  process.exit(1);
});
