import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  publicDir: false,
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  build: {
    outDir: 'build/embed',
    emptyOutDir: false,
    target: 'es2020',
    minify: 'esbuild',
    lib: {
      entry: 'src/embed.tsx',
      formats: ['iife'],
      name: 'OntologyEmbed',
      fileName: () => 'ontology-embed.js',
    },
    rollupOptions: {
      output: {
        assetFileNames: 'ontology-embed.[ext]',
      },
    },
    cssCodeSplit: false,
    reportCompressedSize: true,
  },
});
