// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Jareer Abdullah & Retrace Contributors

import type { Project } from '../core';

/*
 * Projects live in IndexedDB, which holds far more than localStorage's ~5 MB. Each project
 * is two records: a small summary for the projects screen, and the full document, so the
 * list loads without reading every stroke of every project.
 */

export interface ProjectMeta {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  /** Small JPEG data URL of the final frame. */
  thumbnail?: string;
  width: number;
  height: number;
  steps: number;
  /** Playback length in ms. */
  duration: number;
}

const DB_NAME = 'retrace';
const META = 'meta';
const BODIES = 'bodies';

let dbPromise: Promise<IDBDatabase> | null = null;

function db(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(META, { keyPath: 'id' });
      req.result.createObjectStore(BODIES);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = tx.onabort = () => reject(tx.error ?? new Error('Storage transaction failed'));
  });
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Every project's summary, most recently edited first. */
export async function listProjects(): Promise<ProjectMeta[]> {
  const tx = (await db()).transaction(META);
  const all = await request(tx.objectStore(META).getAll() as IDBRequest<ProjectMeta[]>);
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function readProject(id: string): Promise<Project | undefined> {
  const tx = (await db()).transaction(BODIES);
  return request(tx.objectStore(BODIES).get(id) as IDBRequest<Project | undefined>);
}

export async function writeProject(meta: ProjectMeta, project?: Project): Promise<void> {
  const tx = (await db()).transaction([META, BODIES], 'readwrite');
  tx.objectStore(META).put(meta);
  if (project) tx.objectStore(BODIES).put(project, meta.id);
  await done(tx);
}

export async function removeProject(id: string): Promise<void> {
  const tx = (await db()).transaction([META, BODIES], 'readwrite');
  tx.objectStore(META).delete(id);
  tx.objectStore(BODIES).delete(id);
  await done(tx);
}

/* Small per-browser preferences stay in localStorage. */

export function readPref<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function writePref(key: string, value: unknown): void {
  try {
    if (value === undefined || value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Preferences are a convenience.
  }
}
