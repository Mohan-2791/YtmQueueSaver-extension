import React, { useState } from 'react';
import type { PlaylistSnapshot, Track } from '../types';

interface Props {
  snapshot: PlaylistSnapshot;
  isRestoring: boolean;
  onRestore: (id: number) => Promise<void>;
  onDelete?: (id: number) => void;
}

export function SnapshotCard({ snapshot, isRestoring, onRestore, onDelete }: Props): React.ReactElement {
  const [expanded, setExpanded] = useState(false);
  const [restoredUrl, setRestoredUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const tracks: Track[] = snapshot.tracks || [];
  const trackCount = tracks.length;
  const firstTrack = tracks[0];

  const handleRestore = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await onRestore(snapshot.id);
    setRestoredUrl('https://music.youtube.com/library/playlists');
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

  return (
    <div className="glass-panel rounded-xl overflow-hidden transition-all duration-200 hover:border-red-500/30 group">
      {/* Header Banner */}
      <div
        onClick={() => setExpanded(!expanded)}
        className="p-3 cursor-pointer select-none flex items-center gap-3 relative"
      >
        {/* Track Thumbnail or Mosaic */}
        <div className="relative w-12 h-12 shrink-0 rounded-lg overflow-hidden bg-zinc-800 border border-zinc-700/50 shadow-inner flex items-center justify-center">
          {firstTrack?.thumbnail ? (
            <img
              src={firstTrack.thumbnail}
              alt={firstTrack.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              loading="lazy"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          ) : (
            <svg className="w-6 h-6 text-zinc-500" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
            </svg>
          )}
          <span className="absolute bottom-0 right-0 bg-black/80 px-1 py-0.2 text-[9px] font-mono text-zinc-300 rounded-tl">
            {trackCount}
          </span>
        </div>

        {/* Title & Metadata */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <h3 className="text-xs font-semibold text-zinc-100 truncate group-hover:text-red-400 transition-colors">
              {snapshot.title}
            </h3>
            <span
              className={`text-[9px] font-mono px-1.5 py-0.5 rounded-full uppercase tracking-wider font-bold ${
                snapshot.playback_mode === 'VIDEO'
                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                  : 'bg-red-500/20 text-red-400 border border-red-500/30'
              }`}
            >
              {snapshot.playback_mode}
            </span>
          </div>

          <p className="text-[11px] text-zinc-400 truncate mt-0.5">
            {firstTrack ? `${firstTrack.title} • ${firstTrack.artist}` : 'Empty Queue'}
          </p>

          <p className="text-[10px] text-zinc-500 mt-1">
            {formattedDate} • {snapshot.category === 'SESSION_WIPE' ? '⚡ Auto-Saved Wipe' : '💾 Manual Archive'}
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={handleRestore}
            disabled={isRestoring}
            title="Restore as Playlist to YouTube Music Account"
            className="flex items-center gap-1 bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 active:scale-95 text-white font-medium text-[11px] px-2.5 py-1.5 rounded-lg shadow-sm border border-red-500/40 cursor-pointer transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isRestoring ? (
              <span className="inline-block animate-spin w-3 h-3 border-2 border-white border-t-transparent rounded-full" />
            ) : (
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
              </svg>
            )}
            <span>Restore</span>
          </button>

          {restoredUrl && (
            <a
              href={restoredUrl}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-[10px] text-emerald-400 hover:text-emerald-300 underline"
            >
              View in YTM
            </a>
          )}

          <button
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
            className="p-1 text-zinc-400 hover:text-zinc-200 transition-colors"
            title={expanded ? 'Collapse' : 'View Tracks'}
          >
            <svg
              className={`w-4 h-4 transform transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
      </div>

      {/* Expandable Tracklist Inspector */}
      {expanded && (
        <div className="border-t border-zinc-800/80 bg-zinc-950/70 p-3">
          {/* Quick Action Toolbar */}
          <div className="flex justify-between items-center pb-2 mb-2 border-b border-zinc-900">
            <span className="text-[11px] font-medium text-zinc-400">
              Tracklist ({trackCount} songs)
            </span>
            <div className="flex gap-2">
              <button
                onClick={handleCopyTracklist}
                className="text-[10px] text-zinc-400 hover:text-zinc-200 flex items-center gap-1 bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800 transition"
              >
                {copied ? '✓ Copied' : 'Copy List'}
              </button>
              <button
                onClick={handleExportJson}
                className="text-[10px] text-zinc-400 hover:text-zinc-200 flex items-center gap-1 bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800 transition"
              >
                Export JSON
              </button>
              {onDelete && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm('Delete this saved queue snapshot?')) {
                      onDelete(snapshot.id);
                    }
                  }}
                  className="text-[10px] text-red-400/80 hover:text-red-300 bg-red-950/40 px-2 py-0.5 rounded border border-red-900/40 transition"
                >
                  Delete
                </button>
              )}
            </div>
          </div>

          {/* Track rows */}
          <div className="max-h-48 overflow-y-auto space-y-1 pr-1">
            {tracks.map((track, idx) => (
              <div
                key={`${track.videoId}-${idx}`}
                className="flex items-center gap-2 py-1 px-1.5 rounded-md hover:bg-zinc-900/90 transition text-xs group/item"
              >
                <span className="text-[10px] font-mono text-zinc-500 w-4 text-right">
                  {idx + 1}
                </span>
                {track.thumbnail && (
                  <img
                    src={track.thumbnail}
                    alt=""
                    className="w-7 h-7 rounded object-cover shrink-0 bg-zinc-800"
                    loading="lazy"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-zinc-200 truncate group-hover/item:text-red-400 transition-colors">
                    {track.title}
                  </p>
                  <p className="text-[10px] text-zinc-500 truncate">
                    {track.artist || 'Unknown Artist'}
                  </p>
                </div>
                {track.duration && (
                  <span className="text-[10px] font-mono text-zinc-500 shrink-0">
                    {track.duration}
                  </span>
                )}
                <a
                  href={`https://music.youtube.com/watch?v=${track.videoId}`}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  title="Play in YouTube Music"
                  className="opacity-0 group-hover/item:opacity-100 text-zinc-400 hover:text-red-400 transition-opacity p-0.5"
                >
                  <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </a>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
