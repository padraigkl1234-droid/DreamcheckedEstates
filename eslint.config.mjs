import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FlatCompat } from '@eslint/eslintrc';

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

export default [
  { ignores: ['.next/**', 'node_modules/**', 'dreamchecked/**', 'public/**', 'next-env.d.ts', 'tailwind.config.ts'] },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
];
