// Zajednička ESLint pravila za M-AGRO v2.
// Ključno pravilo (01_ARHITEKTURA_v2.md): vendor SDK-ovi se smiju importati SAMO
// unutar src/lib/**. Feature kod ide kroz apstrakcije (DbClient, AuthClient, ...).

export const VENDOR_SDKS = [
  '@supabase/supabase-js',
  '@supabase/ssr',
  '@aws-sdk/*',
  '@anthropic-ai/sdk',
  '@sentry/*',
  'posthog-js',
  'posthog-node',
  'resend',
];

/** @param {{ libGlob?: string[] }} [opts] */
export function vendorBoundary(opts = {}) {
  const libGlob = opts.libGlob ?? ['src/lib/**'];
  return [
    {
      files: ['**/*.{ts,tsx,js,mjs}'],
      ignores: libGlob,
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: VENDOR_SDKS,
                message:
                  'Vendor SDK se importa samo u src/lib/** — koristi apstrakciju (npr. getDb(), getAuth()). Vidi docs/adr/0003.',
              },
            ],
          },
        ],
      },
    },
  ];
}

// Lekcija #14: nikad `catch (e) {}`
export const failLoud = {
  rules: {
    'no-empty': ['error', { allowEmptyCatch: false }],
  },
};
