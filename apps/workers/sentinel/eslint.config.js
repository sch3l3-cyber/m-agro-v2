import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import { vendorBoundary, failLoud } from '@m-agro/eslint-config';

export default tseslint.config({ ignores: ['.wrangler/**'] }, js.configs.recommended, ...tseslint.configs.strict, ...vendorBoundary({ libGlob: ['src/lib/**'] }), failLoud);
