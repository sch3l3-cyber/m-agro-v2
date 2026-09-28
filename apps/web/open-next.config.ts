import { defineCloudflareConfig } from '@opennextjs/cloudflare';

// Faza 0: bez incremental cachea (nema ISR stranica). R2 incremental cache po potrebi kasnije.
export default defineCloudflareConfig({});
