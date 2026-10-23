// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Jareer Abdullah & Retrace Contributors

import { useSyncExternalStore } from 'react';
import { readPref, writePref } from './storage';

export type Theme = 'light' | 'dark';

const KEY = 'retrace:theme';
const listeners = new Set<() => void>();

/** Light, unless you switched to dark. */
export function currentTheme(): Theme {
  return readPref<Theme | null>(KEY, null) === 'dark' ? 'dark' : 'light';
}

function apply() {
  document.documentElement.dataset.theme = currentTheme();
  listeners.forEach((fn) => fn());
}

/** Call once before the first render, so the page never flashes the other theme. */
export function initTheme() {
  apply();
}

export function toggleTheme() {
  writePref(KEY, currentTheme() === 'dark' ? 'light' : 'dark');
  apply();
}

export function useTheme(): Theme {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    currentTheme,
  );
}
