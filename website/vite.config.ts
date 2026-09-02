import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
      react: path.resolve(import.meta.dirname, 'node_modules/react'),
      'react-dom': path.resolve(import.meta.dirname, 'node_modules/react-dom'),
    },
    dedupe: ['react', 'react-dom'],
  },
  optimizeDeps: {
    include: ['@paper-design/shaders'],
  },
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(import.meta.dirname, 'index.html'),
        docs: path.resolve(import.meta.dirname, 'docs/index.html'),
        about: path.resolve(import.meta.dirname, 'about/index.html'),
        contact: path.resolve(import.meta.dirname, 'contact/index.html'),
        privacy: path.resolve(import.meta.dirname, 'privacy/index.html'),
        cli: path.resolve(import.meta.dirname, 'cli/index.html'),
      },
    },
  },
  server: {
    port: 8787,
    strictPort: true,
    host: '127.0.0.1',
  },
})
