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
