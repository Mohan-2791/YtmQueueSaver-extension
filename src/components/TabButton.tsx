import React from 'react';

interface Props {
  label: string;
  active: boolean;
  onClick: () => void;
}

/** Small reusable pill-style tab, used for both the Queue/Settings switcher
 *  and the Session Wipes/History Archive category switcher. */
export function TabButton({ label, active, onClick }: Props): React.ReactElement {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`flex-1 border-0 py-1.5 rounded text-xs font-medium cursor-pointer transition ${
        active ? 'bg-zinc-800 text-white' : 'bg-transparent text-zinc-400 hover:text-zinc-200'
      }`}
    >
      {label}
    </button>
  );
}
