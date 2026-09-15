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
 * Local dev test-login is a debugging convenience only. It must never be
 * reachable in a shipped/packaged build, so it's gated behind Vite's
 * built-in DEV flag: true under `npm run dev`, statically false (and
 * dead-code-eliminated) under `npm run build`.
 */
const SHOW_DEV_LOGIN = import.meta.env.DEV;

export function SettingsForm({ className = '', onSaved }: Props): React.ReactElement {
  // apiUrl is intentionally NOT user-editable. It's loaded from storage
  // (which falls back to DEFAULT_SETTINGS.apiUrl, driven by the
  // VITE_DEFAULT_API_URL build-time env var) and passed straight back
  // through on save, unchanged. There is no UI control for it.
  const [apiUrl, setApiUrl] = useState('');
  const [userId, setUserId] = useState(1);
  const [maxSnapshotsPerCategory, setMaxSnapshotsPerCategory] = useState(50);
  const [songsToRetain, setSongsToRetain] = useState(0); // 0 = all
  const [showCustomAmountInput, setShowCustomAmountInput] = useState(false);
  const [retainScope, setRetainScope] = useState<RetainScope>('all');
  const [googleClientId, setGoogleClientId] = useState('');
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('');

  const loadAll = async () => {
    try {
      const settings = await getSettings();
      setApiUrl(settings.apiUrl);
      setUserId(settings.userId);
      setMaxSnapshotsPerCategory(settings.maxSnapshotsPerCategory);
      setSongsToRetain(settings.songsToRetain);
      setRetainScope(settings.retainScope);
      setGoogleClientId(settings.googleClientId || '');

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

  const handleGoogleLogin = async () => {
    setAuthLoading(true);
    setError(null);
    try {
      const res = await sendExtensionMessage<ApiResponse<UserProfile>>({ action: 'LOGIN_GOOGLE' });
      if (res?.status === 'success' && res.data) {
        setCurrentUser(res.data);
        setStatus('Signed in with Google successfully!');
        setTimeout(() => setStatus(''), 2500);
      } else {
        setError(res?.message || 'Google Sign-in failed. Please try again.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google Sign-in error.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleGoogleLogout = async () => {
    setAuthLoading(true);
    try {
      await sendExtensionMessage({ action: 'LOGOUT' });
      setCurrentUser(null);
      setStatus('Signed out of Google account.');
      setTimeout(() => setStatus(''), 2000);
    } catch (err) {
      setError('Failed to sign out.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleTestLogin = async () => {
    setAuthLoading(true);
    setError(null);
    try {
      const res = await sendExtensionMessage<ApiResponse<UserProfile>>({ action: 'LOGIN_TEST_USER' });
      if (res?.status === 'success' && res.data) {
        setCurrentUser(res.data);
        setStatus('Signed in with Local Dev Test Account!');
        setTimeout(() => setStatus(''), 2500);
      } else {
        setError(res?.message || 'Failed to sign in with test account.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Test account login error.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSave = async (): Promise<void> => {
    setError(null);

    if (!isValidRetentionLimit(maxSnapshotsPerCategory)) {
      setError('Snapshot limit must be between 1 and 500.');
      return;
    }
    if (songsToRetain < 0 || songsToRetain > 500) {
      setError('Songs to retain must be 0 (all) or up to 500.');
      return;
    }

    try {
      await setSettings({
        // Passed through unchanged - not user-editable, see apiUrl comment above.
        apiUrl,
        userId,
        maxSnapshotsPerCategory,
        songsToRetain,
        retainScope,
        googleClientId: googleClientId.trim() || undefined,
      });
      setStatus('Settings saved successfully!');
      setTimeout(() => setStatus(''), 2500);
      onSaved?.();
    } catch (err) {
      logger.error('Failed to save settings', err);
      setError('Could not save settings. Try again.');
    }
  };

  if (!loaded) {
    return <p className="text-xs text-zinc-500 py-4 text-center">Loading settings...</p>;
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Google Authentication Card */}
      <div className="glass-panel p-3.5 rounded-xl border border-zinc-800/80">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-300 m-0">
            Google Account & YTM Access
          </h3>
          <span className="text-[10px] text-zinc-500">OAuth2 Verified</span>
        </div>

        {currentUser ? (
          <div className="flex items-center justify-between bg-zinc-900/80 p-2.5 rounded-lg border border-zinc-800">
            <div className="flex items-center gap-2.5 min-w-0">
              {currentUser.picture ? (
                <img
                  src={currentUser.picture}
                  alt={currentUser.name || 'User'}
                  className="w-8 h-8 rounded-full border border-red-500/50"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-red-600/20 text-red-400 font-bold flex items-center justify-center text-xs">
                  {currentUser.email?.charAt(0).toUpperCase() || 'G'}
                </div>
              )}
              <div className="min-w-0">
                <p className="text-xs font-semibold text-zinc-200 truncate m-0">
                  {currentUser.name || currentUser.email}
                </p>
                <p className="text-[10px] text-zinc-400 truncate m-0">{currentUser.email}</p>
              </div>
            </div>

            <button
              onClick={handleGoogleLogout}
              disabled={authLoading}
              className="text-[11px] text-zinc-400 hover:text-red-400 px-2 py-1 bg-zinc-800 hover:bg-zinc-700 rounded transition border border-zinc-700/50"
            >
              Sign Out
            </button>
          </div>
        ) : (
          <div className="text-center py-2 space-y-2.5">
            <p className="text-[11px] text-zinc-400 m-0">
              Sign in to save wiped queues directly into your personal YouTube Music library.
            </p>

            <button
              onClick={handleGoogleLogin}
              disabled={authLoading}
              className="w-full bg-white hover:bg-zinc-100 active:scale-[0.99] text-zinc-900 font-semibold text-xs py-2 px-3 rounded-lg shadow flex items-center justify-center gap-2 transition disabled:opacity-50"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              <span>{authLoading ? 'Connecting...' : 'Sign in with Google'}</span>
            </button>

            {/* Dev-only test login - never present in production builds */}
            {SHOW_DEV_LOGIN && (
              <button
                onClick={handleTestLogin}
                disabled={authLoading}
                className="w-full bg-zinc-800 hover:bg-zinc-750 active:scale-[0.99] text-zinc-200 border border-zinc-700 font-medium text-xs py-1.5 px-3 rounded-lg flex items-center justify-center gap-1.5 transition"
              >
                <span>⚡ Use Local Dev Account (1-Click Test Mode)</span>
              </button>
            )}

            <div className="pt-2 border-t border-zinc-800/60 text-left">
              <label htmlFor="googleClientId" className="block text-[11px] text-zinc-400 mb-1 font-medium">
                Google OAuth Client ID (Optional for custom setup)
              </label>
              <input
                id="googleClientId"
                type="text"
                value={googleClientId}
                onChange={(e) => setGoogleClientId(e.target.value)}
                placeholder="e.g. 123456789-xyz.apps.googleusercontent.com"
                className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2 text-xs text-zinc-100 font-mono focus:outline-none focus:border-red-500 transition"
              />
              <p className="text-[10px] text-zinc-500 mt-1 leading-normal">
                Paste your OAuth Client ID from Google Cloud Console to link your real personal Google account.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Song Retention Setting */}
      <div className="glass-panel p-3.5 rounded-xl border border-zinc-800/80 space-y-3">
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-zinc-300 mb-1">
            Songs to Retain per Queue
          </label>
          <p className="text-[11px] text-zinc-400 m-0">
            Control how many songs are preserved when a queue wipe occurs.
          </p>
        </div>

        {/* Quick presets */}
        <div className="grid grid-cols-4 gap-1.5">
          {[
            { label: 'All', value: 0 },
            { label: '15 Songs', value: 15 },
            { label: '25 Songs', value: 25 },
            { label: '50 Songs', value: 50 },
          ].map((preset) => (
            <button
              key={preset.value}
              type="button"
              onClick={() => setSongsToRetain(preset.value)}
              className={`py-1.5 px-2 rounded-lg text-xs font-medium transition border ${
                songsToRetain === preset.value
                  ? 'bg-red-600/30 border-red-500 text-red-300'
                  : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>

        {/* Slider - the primary control */}
        <div className="space-y-1.5 pt-1">
          <div className="flex justify-between text-xs text-zinc-400">
            <span>Amount:</span>
            <span className="font-mono text-zinc-200">
              {songsToRetain === 0 ? 'All songs in queue' : `${songsToRetain} songs`}
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={150}
            step={5}
            value={songsToRetain}
            onChange={(e) => setSongsToRetain(Number(e.target.value))}
            className="w-full accent-red-600 bg-zinc-800 rounded-lg cursor-pointer h-1.5"
          />
        </div>

        {/* Advanced: exact number entry, hidden by default */}
        {showCustomAmountInput ? (
          <div className="pt-1 space-y-1">
            <label htmlFor="songsToRetainExact" className="block text-[11px] text-zinc-400">
              Enter exact number
            </label>
            <div className="flex items-center gap-2">
              <input
                id="songsToRetainExact"
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

        {/* Retain Scope */}
        <div className="pt-2 border-t border-zinc-800/60">
          <label className="block text-xs text-zinc-300 mb-1.5 font-medium">
            Retention Starting Point
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setRetainScope('all')}
              className={`p-2 rounded-lg text-left text-xs border transition ${
                retainScope === 'all'
                  ? 'bg-red-950/40 border-red-500/50 text-red-200'
                  : 'bg-zinc-900/60 border-zinc-800 text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <div className="font-semibold text-[11px]">Entire Queue</div>
              <div className="text-[9px] text-zinc-500">From song 1 to limit</div>
            </button>
            <button
              type="button"
              onClick={() => setRetainScope('remaining')}
              className={`p-2 rounded-lg text-left text-xs border transition ${
                retainScope === 'remaining'
                  ? 'bg-red-950/40 border-red-500/50 text-red-200'
                  : 'bg-zinc-900/60 border-zinc-800 text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <div className="font-semibold text-[11px]">From Current Song</div>
              <div className="text-[9px] text-zinc-500">Only remaining unplayed</div>
            </button>
          </div>
        </div>
      </div>

      {/* Backend Settings - API endpoint is intentionally not shown/editable here.
          It's set at build time via the VITE_DEFAULT_API_URL env var (see
          DEFAULT_SETTINGS.apiUrl in lib/storage.ts). */}
      <div className="glass-panel p-3.5 rounded-xl border border-zinc-800/80 space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-300 m-0">
          Cloud Backend Settings
        </h3>

        <div>
          <label htmlFor="maxSnapshots" className="block text-xs text-zinc-400 mb-1">
            Max Saved Queues per Category
          </label>
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
      </div>

      {error && <p className="text-xs text-red-400 bg-red-950/40 p-2 rounded border border-red-900/50 m-0">{error}</p>}
      {status && <p className="text-xs text-emerald-400 bg-emerald-950/40 p-2 rounded border border-emerald-900/50 m-0">{status}</p>}

      <button
        onClick={handleSave}
        className="w-full bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white font-semibold text-xs py-2.5 px-4 rounded-xl shadow-lg border border-red-500/40 cursor-pointer transition active:scale-[0.98]"
      >
        Save All Settings
      </button>
    </div>
  );
}
