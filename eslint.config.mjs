import coreWebVitals from 'eslint-config-next/core-web-vitals';
import typescript from 'eslint-config-next/typescript';

export default [
  {
    ignores: ['.next/**', 'node_modules/**', 'public/**', 'next-env.d.ts'],
  },
  ...coreWebVitals,
  ...typescript,
  {
    files: ['tailwind.config.js'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    rules: {
      // Legacy code is any-heavy; the overhaul replaces it piecewise.
      // Keep as a warning so new code is nudged without blocking builds.
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
];
