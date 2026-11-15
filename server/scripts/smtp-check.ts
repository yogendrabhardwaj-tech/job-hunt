/**
 * Checks the SMTP settings in .env without starting the app.
 *   npm run smtp:check                      # log in only
 *   npm run smtp:check -- you@example.com   # log in and send a test email
 */
import { checkSmtp } from '../src/auth.ts';

try {
  await checkSmtp(process.argv[2]);
  console.log(`✓ SMTP login works${process.argv[2] ? `; test email sent to ${process.argv[2]}` : ''}`);
  process.exit(0);
} catch (e: any) {
  console.error(`✗ ${e.message}`);
  process.exit(1);
}
