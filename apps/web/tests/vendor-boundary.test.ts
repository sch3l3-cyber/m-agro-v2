import { describe, expect, it } from 'vitest';
import { ESLint } from 'eslint';
import { fileURLToPath } from 'node:url';

// Roadmap F0 kriterij: "ESLint blokira import createClient iz @supabase/supabase-js van lib/"
const cwd = fileURLToPath(new URL('..', import.meta.url));
const eslint = new ESLint({ cwd });

async function vendorErrors(filePath: string, code: string) {
  const [res] = await eslint.lintText(code, { filePath });
  return (res?.messages ?? []).filter((m) => m.ruleId === 'no-restricted-imports');
}

describe('vendor granica (ADR-0003)', () => {
  const kod = `import { createClient } from '@supabase/supabase-js';\nexport const x = createClient;\n`;

  it('blokira Supabase SDK u feature kodu', async () => {
    expect(await vendorErrors('src/features/parcele/api.ts', kod)).toHaveLength(1);
  });

  it('blokira Supabase SDK u app/ rutama', async () => {
    expect(await vendorErrors('src/app/(app)/page.ts', kod)).toHaveLength(1);
  });

  it('blokira podputanje (@supabase/ssr, @aws-sdk/*)', async () => {
    const k = `import { createServerClient } from '@supabase/ssr';\nimport { S3Client } from '@aws-sdk/client-s3';\nexport const a = [createServerClient, S3Client];\n`;
    expect(await vendorErrors('src/features/x.ts', k)).toHaveLength(2);
  });

  it('dopušta SDK unutar src/lib/', async () => {
    expect(await vendorErrors('src/lib/db/supabase.ts', kod)).toHaveLength(0);
  });
});
