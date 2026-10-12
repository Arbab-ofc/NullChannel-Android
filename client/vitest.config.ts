import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { css: { include: [/immersive\.css/] }, include: ['src/tests/**/*.test.ts','src/tests/**/*.test.tsx'] } });
