import type { SVGProps } from 'react';

/**
 * Inline stroke icons (currentColor), styled to match Material Symbols
 * Outlined — the icon language used throughout the Lumina Study reference.
 * Decorative by default; callers using an icon as a control's sole label
 * must supply aria-label on the control itself.
 */
function Base(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    />
  );
}

export const DashboardIcon = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}>
    <rect x="3" y="3" width="7" height="9" rx="1.5" />
    <rect x="14" y="3" width="7" height="5" rx="1.5" />
    <rect x="14" y="12" width="7" height="9" rx="1.5" />
    <rect x="3" y="16" width="7" height="5" rx="1.5" />
  </Base>
);

export const LibraryIcon = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}>
    <path d="M3 5.5C3 4.7 3.7 4 4.5 4H11v16H4.5A1.5 1.5 0 0 1 3 18.5v-13Z" />
    <path d="M21 5.5c0-.8-.7-1.5-1.5-1.5H13v16h6.5a1.5 1.5 0 0 0 1.5-1.5v-13Z" />
  </Base>
);

export const QuizIcon = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}>
    <rect x="4" y="3" width="16" height="18" rx="2" />
    <path d="M9 8.5a3 3 0 1 1 4 2.8c-.7.3-1 .9-1 1.7v.5" />
    <circle cx="12" cy="17" r="0.6" fill="currentColor" stroke="none" />
  </Base>
);

export const CalculatorIcon = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}>
    <rect x="5" y="2.5" width="14" height="19" rx="2" />
    <path d="M8 6.5h8" />
    <path d="M8 11h.01M12 11h.01M16 11h.01M8 14.5h.01M12 14.5h.01M16 14.5h.01M8 18h.01M12 18h.01M16 18h.01" />
  </Base>
);

export const GraduationCapIcon = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}>
    <path d="M2 9.5 12 5l10 4.5-10 4.5-10-4.5Z" />
    <path d="M6 11.7v4.3c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5v-4.3" />
    <path d="M20 10v6" />
  </Base>
);

export const SearchIcon = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="m21 21-4.3-4.3" />
  </Base>
);

export const BellIcon = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}>
    <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.7 21a2 2 0 0 1-3.4 0" />
  </Base>
);

export const HelpCircleIcon = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.3 9a2.7 2.7 0 1 1 3.9 2.4c-.8.4-1.2 1-1.2 1.9v.4" />
    <circle cx="12" cy="17" r="0.6" fill="currentColor" stroke="none" />
  </Base>
);

export const PlusIcon = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}>
    <path d="M12 5v14M5 12h14" />
  </Base>
);

export const FlameIcon = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}>
    <path d="M12 2.5s5 4.5 5 9.5a5 5 0 1 1-10 0c0-1.3.5-2.3 1.3-3.4.2 1 .8 1.6 1.5 1.6.9 0 1-1.2.7-2.3-.4-1.4-.2-3 1.5-5.4Z" />
  </Base>
);

export const LightbulbIcon = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}>
    <path d="M9 21h6" />
    <path d="M10 18h4" />
    <path d="M12 3a6 6 0 0 0-3.5 10.9c.5.4.8.9.8 1.5V16h5.4v-.6c0-.6.3-1.1.8-1.5A6 6 0 0 0 12 3Z" />
  </Base>
);

export const CheckCircleIcon = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="m8.5 12.5 2.3 2.3L16 10" />
  </Base>
);

export const RefreshIcon = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}>
    <path d="M3 12a9 9 0 1 0 3-6.7" />
    <path d="M3 4v4h4" />
  </Base>
);

export const FlagIcon = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}>
    <path d="M5 3v18" />
    <path d="M5 4h11l-2 3.5L16 11H5" />
  </Base>
);

export const TimerIcon = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}>
    <circle cx="12" cy="13" r="8" />
    <path d="M12 9v4l2.5 2.5" />
    <path d="M9 2h6" />
  </Base>
);

export const ArrowRightIcon = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}>
    <path d="M5 12h14" />
    <path d="m13 6 6 6-6 6" />
  </Base>
);

export const UploadFileIcon = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}>
    <path d="M14 2v6h6" />
    <path d="M6 22h12a2 2 0 0 0 2-2V8l-6-6H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2Z" />
    <path d="M12 18v-6" />
    <path d="m9.5 14.5 2.5-2.5 2.5 2.5" />
  </Base>
);

export const DocumentIcon = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}>
    <path d="M14 2v6h6" />
    <path d="M6 22h12a2 2 0 0 0 2-2V8l-6-6H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2Z" />
    <path d="M9 13h6M9 17h6" />
  </Base>
);

export const SyncIcon = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}>
    <path d="M3 12a9 9 0 0 1 15.3-6.5L21 8" />
    <path d="M21 3v5h-5" />
    <path d="M21 12a9 9 0 0 1-15.3 6.5L3 16" />
    <path d="M3 21v-5h5" />
  </Base>
);

export const AccountTreeIcon = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}>
    <circle cx="6" cy="6" r="2.2" />
    <circle cx="6" cy="18" r="2.2" />
    <circle cx="18" cy="12" r="2.2" />
    <path d="M8 6h4a2 2 0 0 1 2 2v2M8 18h4a2 2 0 0 0 2-2v-2" />
  </Base>
);

export const MenuBookIcon = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}>
    <path d="M3 5.5C3 4.7 3.7 4 4.5 4H11v16H4.5A1.5 1.5 0 0 1 3 18.5v-13Z" />
    <path d="M21 5.5c0-.8-.7-1.5-1.5-1.5H13v16h6.5a1.5 1.5 0 0 0 1.5-1.5v-13Z" />
    <path d="M7 8h2M7 11h2M15 8h2M15 11h2" />
  </Base>
);

export const CloseIcon = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Base>
);

export const BiotechIcon = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}>
    <path d="M9 2v4.5L4.5 15A3 3 0 0 0 7.2 19.5h9.6A3 3 0 0 0 19.5 15L15 6.5V2" />
    <path d="M7 2h10" />
    <path d="M6.5 15h11" />
  </Base>
);

export const PsychologyIcon = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}>
    <path d="M12 3a5 5 0 0 0-5 5c0 1.4.5 2.2 1.2 3.1.5.6.8 1.1.8 1.9v4.5a1.5 1.5 0 0 0 1.5 1.5h3a1.5 1.5 0 0 0 1.5-1.5V13c0-.8.3-1.3.8-1.9C16.5 10.2 17 9.4 17 8a5 5 0 0 0-5-5Z" />
    <path d="M10 21h4" />
  </Base>
);

export const MenuIcon = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Base>
);

export const ChevronDownIcon = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}>
    <path d="m6 9 6 6 6-6" />
  </Base>
);

export const TouchAppIcon = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}>
    <path d="M12 3v9" />
    <path d="M9 8.5 12 12l3-3.5" />
    <path d="M6 15c0 4 2.7 6 6 6s6-2 6-6v-2a2 2 0 0 0-4 0" />
  </Base>
);

export const SunIcon = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </Base>
);

export const MoonIcon = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}>
    <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
  </Base>
);

export const TrophyIcon = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}>
    <path d="M8 21h8M12 17v4" />
    <path d="M7 4h10v5a5 5 0 0 1-10 0V4Z" />
    <path d="M7 6H5a2 2 0 0 0 0 4h2M17 6h2a2 2 0 0 1 0 4h-2" />
  </Base>
);
