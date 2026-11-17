import { defineConfig } from 'vitest/config';

// Pruebas sin navegador: lógica de la app y rutas del servidor.
// No llaman a Firebase ni a la IA de verdad; esas dependencias se reemplazan en cada prueba.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    env: { TZ: 'America/Santiago' },
    restoreMocks: true,
  },
});
