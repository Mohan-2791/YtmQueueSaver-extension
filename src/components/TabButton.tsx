import React from 'react';

interface Props {
  label: string;
  side: 'A' | 'B';
  active: boolean;
  onClick: () => void;
}

/**
 * A cassette only has two sides, which maps neatly onto this extension's
 * two views: Side A is the live session (auto-saved wipes), Side B is the
 * full archive. Styled as a physical selector switch rather than a generic
 * pill tab so the metaphor holds even in this one small control.
 */
export function TabButton({ label, side, active, onClick }: Props): React.ReactElement {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`flex-1 flex items-center justify-center gap-1.5 border-0 py-2 rounded-md text-[11px] font-semibold tracking-wide cursor-pointer transition-all ${
        active ? 'transport-btn is-primary' : 'transport-btn'
      }`}
    >
      <span className="counter-digits text-[9px] px-1 rounded-sm">{side}</span>
      <span>{label}</span>
    </button>
  );
}
