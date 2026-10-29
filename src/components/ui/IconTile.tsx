import type { LucideIcon } from 'lucide-react';

/** Plain glyphs, no tile behind them. `tone` is kept so callers don't change;
 *  the monochrome UI renders every tone the same. */
export type IconTone = 'green' | 'orange' | 'purple' | 'gray' | 'blue';

export function IconTile({ icon: Icon, size = 20 }: { icon: LucideIcon; tone?: IconTone; size?: number }) {
  return (
    <span
      aria-hidden
      className="flex-shrink-0 flex items-center justify-center text-text-secondary"
      style={{ width: size, height: size }}
    >
      <Icon size={Math.round(size * 0.8)} strokeWidth={1.75} />
    </span>
  );
}
