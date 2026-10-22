// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Jareer Abdullah & Retrace Contributors

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Relative base so the build works from any static host (GitHub Pages, a subfolder, a file server).
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
});
