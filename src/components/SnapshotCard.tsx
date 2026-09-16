import React, { useState } from 'react';
import type { PlaylistSnapshot, Track } from '../types';

interface Props {
  snapshot: PlaylistSnapshot;
  isRestoring: boolean;
  onRestore: (id: number) => Promise<void>;
  onDelete?: (id: number) => void;
}

/**
 * Each saved queue is rendered as a cassette label: a stamped-foil sticker
 * with a hand-set title, a running length ("track counter"), and a side
 * marker for which shelf it came from (auto wipe vs manual archive). The
 * restore/delete actions are drawn as transport keys (▶ play, ⏏ eject)
 * instead of button chrome, so the whole card reads as a physical object
 * rather than a settings row.
 */
export function SnapshotCard({ snapshot, isRestoring, onRestore, onDelete }: Props): React.ReactElement {
  const [expanded, setExpanded] = useState(false);
  const [justPlayed, setJustPlayed] = useState(false);
  const [copied, setCopied] = useState(false);

  const tracks: Track[] = snapshot.tracks || [];
  const trackCount = tracks.length;

  const handleRestore = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await onRestore(snapshot.id);
    setJustPlayed(true);
  };

  const handleCopyTracklist = (e: React.MouseEvent) => {
    e.stopPropagation();
    const text = tracks.map((t, i) => `${i + 1}. ${t.title} - ${t.artist || 'Unknown'}`).join('\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExportJson = (e: React.MouseEvent) => {
    e.stopPropagation();
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(snapshot, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `${snapshot.title.replace(/\s+/g, '_')}_queue.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const formattedDate = new Date(snapshot.created_at).toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const sideLabel = snapshot.category === 'SESSION_WIPE' ? 'SIDE A' : 'SIDE B';

  return (
    <div className="label-panel rounded-lg overflow-hidden transition-all duration-150">
      {/* Sticker header */}
      <div onClick={() => setExpanded(!expanded)} className="p-2.5 cursor-pointer select-none flex items-center gap-2.5">
        {/* Mini reel + counter, standing in for a thumbnail */}
        <div className="relative w-10 h-10 shrink-0 rounded-full flex items-center justify-center reel-hub">
          <svg viewBox="0 0 24 24" className={`w-6 h-6 ${isRestoring ? 'reel-teeth spinning' : 'reel-teeth'}`}>
            <circle cx="12" cy="12" r="3" fill="#171310" />
            {[0, 60, 120, 180, 240, 300].map((deg) => (
              <rect key={deg} x="11.3" y="2.5" width="1.4" height="4" fill="#171310" transform={`rotate(${deg} 12 12)`} />
            ))}
          </svg>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <h3 className="text-xs font-bold truncate" style={{ fontFamily: 'ui-serif, Georgia, serif' }}>
              {snapshot.title}
            </h3>
            <span className="text-[8px] font-mono px-1 py-0.5 rounded-sm border border-black/20 bg-black/5 uppercase tracking-wider shrink-0">
              {sideLabel}
            </span>
          </div>
          <p className="text-[10px] label-sub truncate mt-0.5">{formattedDate}</p>
        </div>

        <div className="counter-digits rounded px-1.5 py-1 text-[10px] shrink-0" title="Tracks on this tape">
          {String(trackCount).padStart(3, '0')}
        </div>
      </div>

      {/* Transport row */}
      <div className="flex items-center gap-1.5 px-2.5 pb-2.5">
        <button
          onClick={handleRestore}
          disabled={isRestoring}
          title="Restore to YouTube Music"
          className="transport-btn is-primary flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1.5 rounded-md cursor-pointer disabled:opacity-50"
        >
          {isRestoring ? (
            <span className="inline-block animate-spin w-3 h-3 border-2 border-current border-t-transparent rounded-full" />
          ) : (
            <span aria-hidden>▶</span>
          )}
          <span>Play onto YTM</span>
        </button>

        {justPlayed && (
          <a
            href="https://music.youtube.com/library/playlists"
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-[10px] label-sub underline"
          >
            View tape
          </a>
        )}

        <button
          onClick={(e) => {
            e.stopPropagation();
            setExpanded(!expanded);
          }}
          className="transport-btn ml-auto p-1.5 rounded-md cursor-pointer"
          title={expanded ? 'Collapse' : 'View tracklist'}
        >
          <svg className={`w-3.5 h-3.5 transform transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {onDelete && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (confirm('Eject and destroy this tape? This cannot be undone.')) {
                onDelete(snapshot.id);
              }
            }}
            title="Eject (delete)"
            className="transport-btn p-1.5 rounded-md cursor-pointer"
          >
            <span aria-hidden className="text-xs leading-none">⏏</span>
          </button>
        )}
      </div>

      {/* Expandable tracklist, shown inside the deck's tape window */}
      {expanded && (
        <div className="tape-window m-2 mt-0 rounded-md p-2">
          <div className="flex justify-between items-center pb-1.5 mb-1.5 border-b border-white/5">
            <span className="text-[10px] font-medium text-zinc-400">{trackCount} tracks</span>
            <div className="flex gap-1.5">
              <button
                onClick={handleCopyTracklist}
                className="text-[9px] text-zinc-400 hover:text-zinc-200 px-1.5 py-0.5 rounded border border-white/10 transition"
              >
                {copied ? '✓ Copied' : 'Copy list'}
              </button>
              <button
                onClick={handleExportJson}
                className="text-[9px] text-zinc-400 hover:text-zinc-200 px-1.5 py-0.5 rounded border border-white/10 transition"
              >
                Export JSON
              </button>
            </div>
          </div>

          <div className="max-h-40 overflow-y-auto space-y-0.5 pr-1">
            {tracks.map((track, idx) => (
              <div key={`${track.videoId}-${idx}`} className="flex items-center gap-2 py-1 px-1 rounded text-xs group/item">
                <span className="text-[9px] font-mono text-zinc-500 w-4 text-right shrink-0">{idx + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-zinc-200 truncate">{track.title}</p>
                  <p className="text-[10px] text-zinc-500 truncate">{track.artist || 'Unknown Artist'}</p>
                </div>
                {track.duration && (
                  <span className="text-[9px] font-mono text-zinc-500 shrink-0">{track.duration}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
