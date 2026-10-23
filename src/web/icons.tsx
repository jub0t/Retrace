// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Jareer Abdullah & Retrace Contributors

import type { ReactNode } from 'react';

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {children}
    </svg>
  );
}

export const PenIcon = () => (
  <Icon>
    <path d="M4 20l1-4L16.5 4.5a2.1 2.1 0 013 3L8 19l-4 1z" />
    <path d="M14.5 6.5l3 3" />
  </Icon>
);

export const EraserIcon = () => (
  <Icon>
    <path d="M8 20h12" />
    <path d="M4.5 15.5l9-9a2 2 0 012.8 0l2.2 2.2a2 2 0 010 2.8L11 19H7.5l-3-3a.7.7 0 010-.5z" />
    <path d="M9 11l5 5" />
  </Icon>
);

export const UndoIcon = () => (
  <Icon>
    <path d="M9 14L4 9l5-5" />
    <path d="M4 9h10.5a5.5 5.5 0 010 11H11" />
  </Icon>
);

export const RedoIcon = () => (
  <Icon>
    <path d="M15 14l5-5-5-5" />
    <path d="M20 9H9.5a5.5 5.5 0 000 11H13" />
  </Icon>
);

export const OnionIcon = () => (
  <Icon>
    <circle cx="9" cy="12" r="6" strokeDasharray="2 2.5" />
    <circle cx="15" cy="12" r="6" />
  </Icon>
);

export const PlayIcon = () => (
  <Icon>
    <path d="M7 4.5v15l12-7.5-12-7.5z" fill="currentColor" />
  </Icon>
);

export const PauseIcon = () => (
  <Icon>
    <rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" />
    <rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" />
  </Icon>
);

export const PlusIcon = () => (
  <Icon>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);

export const TrashIcon = () => (
  <Icon>
    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 002 2h6a2 2 0 002-2l1-12M9 7V4h6v3" />
  </Icon>
);

export const LeftIcon = () => (
  <Icon>
    <path d="M15 6l-6 6 6 6" />
  </Icon>
);

export const RightIcon = () => (
  <Icon>
    <path d="M9 6l6 6-6 6" />
  </Icon>
);

export const PlayStepIcon = () => (
  <Icon>
    <path d="M5 5v14" />
    <path d="M9 5.5v13l10-6.5-10-6.5z" />
  </Icon>
);

export const LoopIcon = () => (
  <Icon>
    <path d="M17 2l3 3-3 3" />
    <path d="M4 11V9a4 4 0 014-4h12" />
    <path d="M7 22l-3-3 3-3" />
    <path d="M20 13v2a4 4 0 01-4 4H4" />
  </Icon>
);

export const HelpIcon = () => (
  <Icon>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.5 9.5a2.5 2.5 0 015 .5c0 1.7-2.5 2-2.5 3.5" />
    <path d="M12 17h.01" />
  </Icon>
);

export const FrameBackIcon = () => (
  <Icon>
    <path d="M18 6l-7 6 7 6" />
    <path d="M7 6v12" />
  </Icon>
);

export const FrameForwardIcon = () => (
  <Icon>
    <path d="M6 6l7 6-7 6" />
    <path d="M17 6v12" />
  </Icon>
);

export const SelectIcon = () => (
  <Icon>
    <path d="M5 3.5l13 6.2-5.6 1.7-2.1 5.6L5 3.5z" />
    <path d="M12.6 11.6l5 5" />
  </Icon>
);

export const LibraryIcon = () => (
  <Icon>
    <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
    <circle cx="17" cy="7" r="3.5" />
    <path d="M7 14l3.5 6.5h-7L7 14z" />
    <path d="M14 14h6.5v6.5H14z" />
  </Icon>
);

export const SaveObjectIcon = () => (
  <Icon>
    <path d="M12 3.5v11" />
    <path d="M7.5 10l4.5 4.5 4.5-4.5" />
    <path d="M4 15.5v3a2 2 0 002 2h12a2 2 0 002-2v-3" />
  </Icon>
);

export const CopyIcon = () => (
  <Icon>
    <rect x="8.5" y="8.5" width="11" height="11" rx="2" />
    <path d="M15.5 8.5V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7.5a2 2 0 002 2h2.5" />
  </Icon>
);

export const CloseIcon = () => (
  <Icon>
    <path d="M6 6l12 12M18 6L6 18" />
  </Icon>
);

export const DownloadIcon = () => (
  <Icon>
    <path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19.5h14" />
  </Icon>
);

export const HandIcon = () => (
  <Icon>
    <path d="M8 12V5.5a1.5 1.5 0 013 0V11" />
    <path d="M11 10.5v-6a1.5 1.5 0 013 0V11" />
    <path d="M14 6.5a1.5 1.5 0 013 0V12" />
    <path d="M17 9.5a1.5 1.5 0 013 0V15a6 6 0 01-6 6h-1.5a6 6 0 01-4.6-2.2L4.6 15.4a1.6 1.6 0 012.4-2.1L8 14.5" />
  </Icon>
);

export const GridIcon = () => (
  <Icon>
    <rect x="4" y="4" width="6.5" height="6.5" rx="1.5" />
    <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" />
    <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" />
    <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5" />
  </Icon>
);

export const SceneIcon = () => (
  <Icon>
    <rect x="3.5" y="9" width="17" height="11" rx="2" />
    <path d="M3.8 9l15.4-4.2-.9-3.1L4 5.7z" />
    <path d="M8.5 4.4l2 3M13 3.2l2 3" />
  </Icon>
);

export const DuplicateIcon = () => (
  <Icon>
    <rect x="8" y="8" width="12" height="12" rx="2" />
    <path d="M16 8V6a2 2 0 00-2-2H6a2 2 0 00-2 2v8a2 2 0 002 2h2" />
  </Icon>
);

export const MinusIcon = () => (
  <Icon>
    <path d="M5 12h14" />
  </Icon>
);

export const MoreIcon = () => (
  <Icon>
    <circle cx="6" cy="12" r="0.6" fill="currentColor" />
    <circle cx="12" cy="12" r="0.6" fill="currentColor" />
    <circle cx="18" cy="12" r="0.6" fill="currentColor" />
  </Icon>
);

export const ChevronDownIcon = () => (
  <Icon>
    <path d="M7 10l5 5 5-5" />
  </Icon>
);

export const FolderIcon = () => (
  <Icon>
    <path d="M3.5 7.5a2 2 0 012-2h3.8l2 2.2h7.2a2 2 0 012 2V17a2 2 0 01-2 2H5.5a2 2 0 01-2-2z" />
  </Icon>
);

export const ExportIcon = () => (
  <Icon>
    <path d="M12 15V4M7.5 8.5L12 4l4.5 4.5" />
    <path d="M5 14v4a2 2 0 002 2h10a2 2 0 002-2v-4" />
  </Icon>
);

export const FitIcon = () => (
  <Icon>
    <path d="M4 9V5.5A1.5 1.5 0 015.5 4H9M15 4h3.5A1.5 1.5 0 0120 5.5V9M20 15v3.5a1.5 1.5 0 01-1.5 1.5H15M9 20H5.5A1.5 1.5 0 014 18.5V15" />
  </Icon>
);

export const SunIcon = () => (
  <Icon>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
  </Icon>
);

export const MoonIcon = () => (
  <Icon>
    <path d="M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z" />
  </Icon>
);

export const EyeIcon = () => (
  <Icon>
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
    <circle cx="12" cy="12" r="2.8" />
  </Icon>
);

export const EyeOffIcon = () => (
  <Icon>
    <path d="M9.9 5.8A9.6 9.6 0 0112 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 01-2.6 3.5M6.4 7.3A16.5 16.5 0 002.5 12S6 18.5 12 18.5a9 9 0 004.6-1.3" />
    <path d="M4 4l16 16" />
  </Icon>
);

export const LockIcon = () => (
  <Icon>
    <rect x="5" y="10.5" width="14" height="9.5" rx="2" />
    <path d="M8 10.5V8a4 4 0 018 0v2.5" />
  </Icon>
);

export const UnlockIcon = () => (
  <Icon>
    <rect x="5" y="10.5" width="14" height="9.5" rx="2" />
    <path d="M8 10.5V8a4 4 0 017.6-1.7" />
  </Icon>
);

export const FilmIcon = () => (
  <Icon>
    <rect x="3.5" y="5" width="17" height="14" rx="2" />
    <path d="M7.5 5v14M16.5 5v14M3.5 9.5h4M3.5 14.5h4M16.5 9.5h4M16.5 14.5h4" />
  </Icon>
);
