import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import nextVitals from 'eslint-config-next/core-web-vitals';
import { vendorBoundary, failLoud } from '@m-agro/eslint-config';

export default tseslint.config(
  { ignores: ['.next/**', '.open-next/**', 'next-env.d.ts', 'tests/fixtures/**'] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  ...nextVitals,
  ...vendorBoundary({ libGlob: ['src/lib/**'] }),
  failLoud,
);
