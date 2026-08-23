/// <reference types="vitest" />

import legacy from '@vitejs/plugin-legacy'
import vue from '@vitejs/plugin-vue'
import path from 'path'
import { defineConfig } from 'vite'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  // Le mode "electron" est passé uniquement par le script "electron:build".
  // Le plugin legacy force un chargement SystemJS sous file://, ce qui casse
  // le chargement des modules dans Electron ; on le désactive donc pour ce build.
  plugins: [
    vue(),
    ...(mode === 'electron' ? [] : [legacy()])
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom'
  }
}))
