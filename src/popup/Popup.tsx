import React, { useEffect, useState } from 'react';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { ToastProvider } from '../components/Toast';
import { QueueView } from './QueueView';
import { CachedQueueDrawer } from './CachedQueueDrawer';
import { SettingsForm } from '../components/SettingsForm';
import { getStoredCachedQueue, getAuthSession } from '../lib/storage';
import type { UserProfile, CachedQueueData } from '../types';

type MainTab = 'session' | 'history';

function PopupContent(): React.ReactElement {
  const [activeTab, setActiveTab] = useState<MainTab>('session');
  const [showCachedDrawer, setShowCachedDrawer] = useState(false);
  const [showSettingsDrawer, setShowSettingsDrawer] = useState(false);
  const [cachedData, setCachedData] = useState<CachedQueueData | null>(null);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const loadHeaderState = async () => {
    try {
      const [storedQueue, session] = await Promise.all([
        getStoredCachedQueue(),
        getAuthSession(),
      ]);
      setCachedData(storedQueue);
      setCurrentUser(session.currentUser);
    } catch {}
  };

  useEffect(() => {
    loadHeaderState();
    const interval = setInterval(loadHeaderState, 3000);
    return () => clearInterval(interval);
  }, [refreshKey]);

  return (
    <div style={{ width: '380px' }} className="p-3.5 font-sans bg-[#08080a] text-zinc-100 min-h-[500px] flex flex-col relative select-none">
      {/* Top App Header */}
      <div className="flex justify-between items-center pb-3 mb-3 border-b border-zinc-800/80">
        {/* Brand & Equalizer */}
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-red-600 to-rose-700 flex items-center justify-center shadow-lg shadow-red-600/30 border border-red-500/40">
            <div className="flex items-end gap-0.5 h-3.5">
              <span className="w-0.5 bg-white rounded-full animate-bar-1" />
              <span className="w-0.5 bg-white rounded-full animate-bar-2" />
              <span className="w-0.5 bg-white rounded-full animate-bar-3" />
            </div>
          </div>
          <div>
            <h1 className="text-xs font-bold text-zinc-100 uppercase tracking-wider m-0 leading-none flex items-center gap-1.5">
              <span>YTM Saver</span>
              <span className="text-[9px] font-mono bg-red-600/20 text-red-400 px-1 py-0.2 rounded border border-red-500/30 font-normal">
                v1.1
              </span>
            </h1>
            <p className="text-[9px] text-zinc-500 m-0 leading-none mt-1">
              {currentUser?.email ? currentUser.email : 'Personal Queue Guardian'}
            </p>
          </div>
        </div>

        {/* Header Actions: Cached Queue Pill + Settings Icon */}
        <div className="flex items-center gap-1.5">
          {/* Live Cached Queue Pill */}
          <button
            onClick={() => setShowCachedDrawer(true)}
            className="flex items-center gap-1.5 bg-zinc-900/90 hover:bg-zinc-800 border border-zinc-800/90 px-2 py-1 rounded-full text-[10px] text-zinc-300 transition hover:border-red-500/40 cursor-pointer shadow-sm group"
            title="Inspect Live YouTube Music Cached Queue"
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
            </span>
            <span className="font-mono font-medium group-hover:text-red-300">
              {cachedData && cachedData.count > 0 ? `${cachedData.count} Live` : 'Cached Queue'}
            </span>
          </button>

          {/* Settings / Google Account Trigger */}
          <button
            onClick={() => setShowSettingsDrawer(true)}
            className={`p-1.5 rounded-lg border transition cursor-pointer ${
              showSettingsDrawer
                ? 'bg-red-600/20 border-red-500/50 text-red-300'
                : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
            }`}
            title="Settings & Google Account"
          >
            {currentUser?.picture ? (
              <img
                src={currentUser.picture}
                alt=""
                className="w-4 h-4 rounded-full border border-red-500/40 object-cover"
              />
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Two Main Tabs: Current Session vs Total History */}
      <div role="tablist" className="grid grid-cols-2 bg-zinc-950 p-1 rounded-xl gap-1 mb-3 border border-zinc-900 shadow-inner">
        <button
          role="tab"
          aria-selected={activeTab === 'session'}
          onClick={() => {
            setActiveTab('session');
            setShowSettingsDrawer(false);
          }}
          className={`py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer border ${
            activeTab === 'session' && !showSettingsDrawer
              ? 'bg-zinc-900 text-white border-zinc-700/80 shadow-md shadow-black/40'
              : 'text-zinc-400 hover:text-zinc-200 border-transparent hover:bg-zinc-900/40'
          }`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
          <span>Current Session</span>
        </button>

        <button
          role="tab"
          aria-selected={activeTab === 'history'}
          onClick={() => {
            setActiveTab('history');
            setShowSettingsDrawer(false);
          }}
          className={`py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer border ${
            activeTab === 'history' && !showSettingsDrawer
              ? 'bg-zinc-900 text-white border-zinc-700/80 shadow-md shadow-black/40'
              : 'text-zinc-400 hover:text-zinc-200 border-transparent hover:bg-zinc-900/40'
          }`}
        >
          <svg className="w-3.5 h-3.5 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>Total History</span>
        </button>
      </div>

      {/* Tab Content or Settings View */}
      <div className="flex-1">
        <ErrorBoundary>
          {showSettingsDrawer ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-zinc-900">
                <h2 className="text-xs font-bold text-zinc-200 uppercase tracking-wide m-0">
                  Settings & Preferences
                </h2>
                <button
                  onClick={() => setShowSettingsDrawer(false)}
                  className="text-xs text-zinc-400 hover:text-zinc-200 px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800"
                >
                  Done
                </button>
              </div>
              <SettingsForm onSaved={() => setRefreshKey((k) => k + 1)} />
            </div>
          ) : (
            <QueueView
              key={`${activeTab}-${refreshKey}`}
              mode={activeTab}
              onOpenCachedQueue={() => setShowCachedDrawer(true)}
            />
          )}
        </ErrorBoundary>
      </div>

      {/* Live Cached Queue Drawer Modal */}
      <CachedQueueDrawer
        isOpen={showCachedDrawer}
        onClose={() => setShowCachedDrawer(false)}
        onSnapshotSaved={() => {
          setRefreshKey((k) => k + 1);
        }}
      />
    </div>
  );
}

export default function Popup(): React.ReactElement {
  return (
    <ToastProvider>
      <PopupContent />
    </ToastProvider>
  );
}
