import type { NavIcon } from '@/lib/app-navigation';
const paths: Record<NavIcon | 'menu' | 'close' | 'chevron', string> = {
  organization:
    'M4 21V4a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v17M15 9h4a1 1 0 0 1 1 1v11M8 7h3M8 11h3M8 15h3M2 21h20',
  artisan: 'M12 21s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 5.5-7 10-7 10z',
  support: 'M21 12a9 9 0 1 1-3.5-7.1L21 4v5h-5M12 8v4l3 2',
  approval: 'M9 12l2 2 4-4M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
  users:
    'M16 20a4 4 0 0 0-8 0M12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6M22 20a3.5 3.5 0 0 0-4-3.4M2 20a3.5 3.5 0 0 1 4-3.4',
  audit: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  privacy: 'M6 11V8a6 6 0 0 1 12 0v3M5 11h14v10H5zM12 15v2',
  menu: 'M4 7h16M4 12h16M4 17h16',
  close: 'M6 6l12 12M18 6L6 18',
  chevron: 'M6 9l6 6 6-6',
};
export function Icon({ name, size = 20 }: { name: keyof typeof paths; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
