/**
 * Strips the auto-embedded supplier name off existing PurchaseBatch names
 * — e.g. "Forest Gate Bookshop — PO 2026-08" becomes "PO 2026-08". Only
 * touches batches whose name still starts with exactly "<supplier name> — "
 * (so anything you've already manually renamed is left untouched).
 *
 * Dry-run by default — prints what it would rename without writing.
 * Pass --commit to actually save. Safe to re-run: only matches batches
 * still carrying the old prefix.
 */
import { PrismaClient } from '@prisma/client';

process.loadEnvFile();

const DRY_RUN = !process.argv.includes('--commit');
const prisma = new PrismaClient();

async function main() {
  console.log(DRY_RUN ? '\n=== DRY RUN — no writes will happen ===\n' : '\n=== COMMIT MODE — writing to Neon ===\n');

  const batches = await prisma.purchaseBatch.findMany({
    include: { supplier: { select: { name: true } } },
  });

  let changed = 0;
  const newNames = new Map<string, string[]>(); // track collisions for a heads-up, nothing more

  for (const b of batches) {
    if (!b.supplier) continue;
    const prefix = `${b.supplier.name} — `;
    if (!b.name.startsWith(prefix)) continue;

    const newName = b.name.slice(prefix.length).trim() || `PO ${b.poMonth ?? '?'}`;
    console.log(`  "${b.name}" → "${newName}"`);
    changed++;

    const existing = newNames.get(newName) ?? [];
    existing.push(b.id);
    newNames.set(newName, existing);

    if (!DRY_RUN) {
      await prisma.purchaseBatch.update({ where: { id: b.id }, data: { name: newName } });
    }
  }

  const collisions = [...newNames.entries()].filter(([, ids]) => ids.length > 1);
  if (collisions.length > 0) {
    console.log(`\n⚠ ${collisions.length} name(s) would end up shared by more than one batch (harmless, just FYI):`);
    for (const [name, ids] of collisions) console.log(`  "${name}" — ${ids.length} batches`);
  }

  console.log(`\n${changed} batch(es) ${DRY_RUN ? 'would be' : 'were'} renamed.`);
  console.log(DRY_RUN ? '\n(DRY RUN — review this, then re-run with --commit.)\n' : '\n(COMMIT — saved to Neon.)\n');

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('Cleanup failed:', err);
  await prisma.$disconnect();
  process.exit(1);
});
