/**
 * Moves the data from before accounts existed (db.json, settings.json, resumes/) into one user's account.
 *
 *   npm run claim-data -- you@example.com                 # local data folder
 *   STORAGE=blob npm run claim-data -- you@example.com    # Vercel Blob store (needs Blob credentials)
 *
 * Stop the app first, so it doesn't write the old files back while they move.
 */
import { attachExistingData } from '../src/auth.ts';
import * as storage from '../src/storage.ts';

const email = process.argv[2];
if (!email) {
  console.error('Usage: npm run claim-data -- you@example.com');
  process.exit(1);
}
try {
  const { user, files } = await attachExistingData(email);
  await storage.flush();
  console.log(`✓ Moved ${files} files into the account ${user.email} (${user.id})`);
  process.exit(0);
} catch (e: any) {
  console.error(`✗ ${e.message}`);
  process.exit(1);
}
