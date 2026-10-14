import { defineConfig } from 'vitest/config';
export default defineConfig({ define: {'import.meta.env.VITE_API_URL':'""','import.meta.env.VITE_WEBRTC_STUN_URLS':'""'}, test: { css: { include: [/immersive\.css/] }, include: ['src/tests/**/*.test.ts','src/tests/**/*.test.tsx'] } });
