import React, { useEffect, useState } from 'react';
import { getSettings, setSettings, getAuthSession } from '../lib/storage';
import { sendExtensionMessage } from '../lib/chromeMessage';
import { isValidRetentionLimit } from '../lib/validation';
import { logger } from '../lib/logger';
import type { UserProfile, RetainScope, ApiResponse } from '../types';

interface Props {
  className?: string;
  onSaved?: () => void;
}

/**
 * "Label Editor" — the cassette's settings surface.
 *
 * Deliberately narrow scope: this only exposes choices that change what
 * gets written to a tape (how much to retain, where retention starts, how
 * many tapes to keep). It does not expose:
 *   - a Google OAuth client ID field,
 *   - any "sign in with Google" branding, or
 *   - the backend API URL.
 *
 * Those remain internal implementation details (wired at build time / by
 * the account connection flow) rather than something a viewer of this UI
 * should ever need to see, type in, or reason about. Account state is
 * still readable and actionable here, just without exposing the mechanism.
 */
export function SettingsForm({ className = '', onSaved }: Props): React.ReactElement {
  const [maxSnapshotsPerCategory, setMaxSnapshotsPerCategory] = useState(50);
  const [songsToRetain, setSongsToRetain] = useState(0); // 0 = all
  const [showCustomAmountInput, setShowCustomAmountInput] = useState(false);
  const [retainScope, setRetainScope] = useState<RetainScope>('all');
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('');

  // Settings fields that exist but are intentionally not editable from this
  // form (apiUrl, googleClientId) are read once and passed straight back
  // through on save, unchanged, so saving retention settings can never
  // clobber them.
  const passthroughRef = React.useRef<{ apiUrl: string; googleClientId?: string; userId: number }>({
    apiUrl: '',
    userId: 1,
  });

  const loadAll = async () => {
    try {
      const settings = await getSettings();
      passthroughRef.current = {
        apiUrl: settings.apiUrl,
        googleClientId: settings.googleClientId,
        userId: settings.userId,
      };
      setMaxSnapshotsPerCategory(settings.maxSnapshotsPerCategory);
      setSongsToRetain(settings.songsToRetain);
      setRetainScope(settings.retainScope);

      const session = await getAuthSession();
      setCurrentUser(session.currentUser);
    } catch (err) {
      logger.error('Failed to load settings or session', err);
    } finally {
      setLoaded(true);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const handleConnect = async () => {
    setAuthLoading(true);
    setError(null);
    try {
      const res = await sendExtensionMessage<ApiResponse<UserProfile>>({ action: 'LOGIN_GOOGLE' });
      if (res?.status === 'success' && res.data) {
        setCurrentUser(res.data);
        setStatus('Account connected.');
        setTimeout(() => setStatus(''), 2200);
      } else {
        setError(res?.message || 'Could not connect account.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not connect account.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleDisconnect = async () => {
    setAuthLoading(true);
    try {
      await sendExtensionMessage({ action: 'LOGOUT' });
      setCurrentUser(null);
      setStatus('Account disconnected.');
      setTimeout(() => setStatus(''), 1800);
    } catch {
      setError('Failed to disconnect.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSave = async (): Promise<void> => {
    setError(null);

    if (!isValidRetentionLimit(maxSnapshotsPerCategory)) {
      setError('Tape rack limit must be between 1 and 500.');
      return;
    }
    if (songsToRetain < 0 || songsToRetain > 500) {
      setError('Songs to retain must be 0 (all) or up to 500.');
      return;
    }

    try {
      await setSettings({
        apiUrl: passthroughRef.current.apiUrl,
        userId: passthroughRef.current.userId,
        googleClientId: passthroughRef.current.googleClientId,
        maxSnapshotsPerCategory,
        songsToRetain,
        retainScope,
      });
      setStatus('Label saved.');
      setTimeout(() => setStatus(''), 2200);
      onSaved?.();
    } catch (err) {
      logger.error('Failed to save settings', err);
      setError('Could not save. Try again.');
    }
  };

  if (!loaded) {
    return <p className="text-xs text-zinc-500 py-4 text-center">Reading label...</p>;
  }

  return (
    <div className={`space-y-3 ${className}`}>
      {/* Account status — generic, no provider branding or client id */}
      <div className="label-panel rounded-lg p-3 flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`led ${currentUser ? 'led-green' : 'led-off'}`} />
          <div className="min-w-0">
            <p className="text-xs font-bold m-0 truncate">
              {currentUser ? currentUser.name || currentUser.email : 'No account connected'}
            </p>
            <p className="text-[10px] label-sub m-0">
              {currentUser ? 'Restores write to this account' : 'Connect to restore tapes onto YouTube Music'}
            </p>
          </div>
        </div>
        <button
          onClick={currentUser ? handleDisconnect : handleConnect}
          disabled={authLoading}
          className="transport-btn shrink-0 text-[11px] px-2.5 py-1.5 rounded-md cursor-pointer disabled:opacity-50"
        >
          {authLoading ? '...' : currentUser ? 'Disconnect' : 'Connect'}
        </button>
      </div>

      {/* Retention */}
      <div className="cassette-shell rounded-xl p-3 space-y-3">
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-zinc-300 mb-1">
            Recording length
          </label>
          <p className="text-[11px] text-zinc-500 m-0">How much of a wiped queue gets recorded to tape.</p>
        </div>

        <div className="grid grid-cols-4 gap-1.5">
          {[
            { label: 'All', value: 0 },
            { label: '15', value: 15 },
            { label: '25', value: 25 },
            { label: '50', value: 50 },
          ].map((preset) => (
            <button
              key={preset.value}
              type="button"
              onClick={() => setSongsToRetain(preset.value)}
              className={`py-1.5 px-2 rounded-md text-xs font-medium transition ${
                songsToRetain === preset.value ? 'transport-btn is-primary' : 'transport-btn'
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>

        <div className="space-y-1.5">
          <div className="flex justify-between items-center">
            <span className="text-[11px] text-zinc-400">Length</span>
            <span className="counter-digits rounded px-2 py-0.5 text-[11px]">
              {songsToRetain === 0 ? 'FULL' : String(songsToRetain).padStart(3, '0')}
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={150}
            step={5}
            value={songsToRetain}
            onChange={(e) => setSongsToRetain(Number(e.target.value))}
            className="w-full accent-[#d1453b] bg-zinc-800 rounded-lg cursor-pointer h-1.5"
          />
        </div>

        {showCustomAmountInput ? (
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              max={500}
              value={songsToRetain}
              onChange={(e) => setSongsToRetain(Number(e.target.value))}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2 text-xs text-zinc-100 focus:outline-none focus:border-red-500 transition"
            />
            <button
              type="button"
              onClick={() => setShowCustomAmountInput(false)}
              className="text-[11px] text-zinc-500 hover:text-zinc-300 px-2 py-2 shrink-0"
            >
              Done
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowCustomAmountInput(true)}
            className="text-[11px] text-zinc-500 hover:text-zinc-300 underline bg-transparent border-0 cursor-pointer p-0"
          >
            Enter exact number
          </button>
        )}

        <div className="pt-2 border-t border-white/5">
          <label className="block text-xs text-zinc-300 mb-1.5 font-medium">Start recording from</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setRetainScope('all')}
              className={`p-2 rounded-lg text-left text-xs transition ${
                retainScope === 'all' ? 'transport-btn is-primary' : 'transport-btn'
              }`}
            >
              <div className="font-semibold text-[11px]">Start of tape</div>
              <div className="text-[9px] opacity-75">Whole queue, from song 1</div>
            </button>
            <button
              type="button"
              onClick={() => setRetainScope('remaining')}
              className={`p-2 rounded-lg text-left text-xs transition ${
                retainScope === 'remaining' ? 'transport-btn is-primary' : 'transport-btn'
              }`}
            >
              <div className="font-semibold text-[11px]">Current position</div>
              <div className="text-[9px] opacity-75">Only what's unplayed</div>
            </button>
          </div>
        </div>
      </div>

      {/* Rack capacity */}
      <div className="cassette-shell rounded-xl p-3 space-y-2">
        <label htmlFor="maxSnapshots" className="block text-xs font-bold uppercase tracking-wider text-zinc-300">
          Tape rack limit
        </label>
        <p className="text-[11px] text-zinc-500 m-0 -mt-1">Oldest tapes are ejected past this count, per shelf.</p>
        <input
          id="maxSnapshots"
          type="number"
          min={1}
          max={500}
          value={maxSnapshotsPerCategory}
          onChange={(e) => setMaxSnapshotsPerCategory(Number(e.target.value))}
          className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2 text-xs text-zinc-100 focus:outline-none focus:border-red-500 transition"
        />
      </div>

      {error && <p className="text-xs text-red-400 bg-red-950/40 p-2 rounded border border-red-900/50 m-0">{error}</p>}
      {status && <p className="text-xs text-emerald-400 bg-emerald-950/40 p-2 rounded border border-emerald-900/50 m-0">{status}</p>}

      <button
        onClick={handleSave}
        className="w-full transport-btn is-primary font-semibold text-xs py-2.5 px-4 rounded-xl cursor-pointer"
      >
        Save label
      </button>
    </div>
  );
}
