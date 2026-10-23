// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Jareer Abdullah & Retrace Contributors

import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { ASSET_EXTENSION, brushOf, paintOrder, strokeFillPath, strokeOutlinePath, svgPaint, type Asset } from '../core';
import { ASSET_DRAG_TYPE } from './Canvas';
import { download } from './files';
import { DownloadIcon, TrashIcon } from './icons';
import { actions, setState, useEditor } from './store';
import { Kbd, TextButton, cx } from './ui';

/** Saved objects, as the inspector's Library tab: click to add to the current step, or drag onto the canvas. */
export function LibraryPanel() {
  const library = useEditor((s) => s.library);
  const fileRef = useRef<HTMLInputElement>(null);

  const importFiles = async (files: FileList | null) => {
    let added = 0;
    for (const file of files ?? []) {
      try {
        added += actions.importAssets(await file.text());
      } catch (err) {
        setState({ status: `${file.name}: ${err instanceof Error ? err.message : String(err)}` });
        return;
      }
    }
    if (added) setState({ status: `Imported ${added} object${added === 1 ? '' : 's'}` });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between border-b border-line py-1.5 pr-1.5 pl-3.5">
        <span className="text-muted tabular-nums">
          {library.length} object{library.length === 1 ? '' : 's'}
        </span>
        <span className="flex items-center gap-0.5">
          <TextButton className="h-6 px-2" onClick={() => fileRef.current?.click()} title="Import objects from .json files">
            Import
          </TextButton>
          {library.length > 0 && (
            <TextButton
              className="h-6 px-2"
              title="Download every object as one file"
              onClick={() => download(new Blob([JSON.stringify({ type: 'retrace/library', version: 1, assets: library })], { type: 'application/json' }), 'library.retrace-assets.json')}
            >
              Export
            </TextButton>
          )}
        </span>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          multiple
          hidden
          onChange={(e) => {
            void importFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </div>

      {library.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center leading-relaxed text-muted">
          <p className="font-medium text-ink">No objects yet</p>
          <p>
            Select strokes with <Kbd>V</Kbd>, then choose <b className="font-medium text-ink">Save as object</b>. Reuse them in any
            drawing, and they replay with the same hand motion.
          </p>
        </div>
      ) : (
        <div className="grid flex-1 auto-rows-min grid-cols-2 gap-2 overflow-y-auto p-2.5 [scrollbar-width:thin]">
          {library.map((asset) => (
            <AssetCard key={asset.id} asset={asset} />
          ))}
        </div>
      )}
      <p className="border-t border-line px-3.5 py-2 text-[11px] leading-snug text-faint">
        Click to add, or drag onto the canvas. Objects are shared by all your projects in this browser; export them to share.
      </p>
    </div>
  );
}

function AssetCard({ asset }: { asset: Asset }) {
  const [renaming, setRenaming] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  useEffect(() => {
    if (!confirmDelete) return;
    const t = setTimeout(() => setConfirmDelete(false), 3000);
    return () => clearTimeout(t);
  }, [confirmDelete]);

  return (
    <div
      className="group relative flex cursor-grab flex-col overflow-hidden rounded-ctl bg-raised ring-1 ring-line hover:ring-accent active:cursor-grabbing"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(ASSET_DRAG_TYPE, asset.id);
        e.dataTransfer.effectAllowed = 'copy';
      }}
      onClick={() => !renaming && actions.insertAsset(asset)}
      title={`${asset.name}: click to add, drag to place`}
    >
      <AssetThumb asset={asset} />
      <div className="flex h-7 items-center border-t border-line px-2 text-xs">
        {renaming ? (
          <input
            autoFocus
            className="w-full min-w-0 rounded-ctl bg-field px-1 ring-1 ring-accent outline-none select-text"
            defaultValue={asset.name}
            onClick={(e) => e.stopPropagation()}
            onBlur={(e) => {
              actions.renameAsset(asset.id, e.target.value);
              setRenaming(false);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
              if (e.key === 'Escape') setRenaming(false);
            }}
          />
        ) : (
          <span
            className="truncate"
            onDoubleClick={(e) => {
              e.stopPropagation();
              setRenaming(true);
            }}
            title="Double-click to rename"
          >
            {asset.name}
          </span>
        )}
      </div>
      <div className="absolute top-1 right-1 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          className="grid size-6 place-items-center rounded-ctl bg-raised/90 text-muted shadow-sm hover:text-ink [&_svg]:size-3.5"
          title="Export as a file"
          aria-label={`Export ${asset.name}`}
          onClick={(e) => {
            e.stopPropagation();
            download(new Blob([JSON.stringify(asset)], { type: 'application/json' }), `${slug(asset.name)}${ASSET_EXTENSION}`);
          }}
        >
          <DownloadIcon />
        </button>
        <button
          className={cx(
            'grid h-6 place-items-center rounded-ctl shadow-sm [&_svg]:size-3.5',
            confirmDelete ? 'bg-danger px-1.5 text-[11px] font-medium text-white' : 'w-6 bg-raised/90 text-muted hover:text-danger',
          )}
          title="Delete from library"
          aria-label={`Delete ${asset.name}`}
          onClick={(e) => {
            e.stopPropagation();
            if (confirmDelete) actions.deleteAsset(asset.id);
            else setConfirmDelete(true);
          }}
        >
          {confirmDelete ? 'Delete?' : <TrashIcon />}
        </button>
      </div>
    </div>
  );
}

/** The object's strokes as SVG, drawn with the same outline engine as the canvas. */
const AssetThumb = memo(function AssetThumb({ asset }: { asset: Asset }) {
  const paths = useMemo(
    () =>
      paintOrder(asset.strokes, (s) => s).map((s, i) => {
        const paint = svgPaint(s, `${asset.id}-${i}`);
        return { d: strokeOutlinePath(s), fill: paint.fill, def: paint.def, opacity: brushOf(s.brush).opacity, area: s.fill ? { d: strokeFillPath(s), fill: s.fill } : null };
      }),
    [asset.id, asset.strokes],
  );
  const defs = paths.map((p) => p.def).join('');
  const pad = Math.max(asset.width, asset.height) * 0.08;
  return (
    <svg
      className="block aspect-[4/3] w-full bg-paper"
      viewBox={`${-pad} ${-pad} ${asset.width + pad * 2} ${asset.height + pad * 2}`}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden
    >
      {defs && <defs dangerouslySetInnerHTML={{ __html: defs }} />}
      {paths.map((p, i) => (
        <g key={i}>
          {p.area && <path d={p.area.d} fill={p.area.fill} />}
          <path d={p.d} fill={p.fill} fillOpacity={p.opacity} />
        </g>
      ))}
    </svg>
  );
});

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'object';
}
