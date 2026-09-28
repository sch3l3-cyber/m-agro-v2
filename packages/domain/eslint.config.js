import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import { vendorBoundary, failLoud } from '@m-agro/eslint-config';

// domain/ je čisti paket: ne smije ovisiti ni o jednom vendor SDK-u (libGlob = nema izuzetaka)
export default tseslint.config(js.configs.recommended, ...tseslint.configs.strict, ...vendorBoundary({ libGlob: [] }), failLoud);
