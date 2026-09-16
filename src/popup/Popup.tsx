import React, { useEffect, useState } from 'react';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { ToastProvider } from '../components/Toast';
import { TabButton } from '../components/TabButton';
import { QueueView } from './QueueView';
import { CachedQueueDrawer } from './CachedQueueDrawer';
import { SettingsForm } from '../components/SettingsForm';
import { getStoredCachedQueue, getAuthSession } from '../lib/storage';
import type { UserProfile, CachedQueueData } from '../types';

type MainTab = 'session' | 'history';

function Reel({ spinning }: { spinning: boolean }): React.ReactElement {
  return (
    <div className="w-9 h-9 rounded-full reel-hub flex items-center justify-center">
      <svg viewBox="0 0 24 24" className={`w-5 h-5 ${spinning ? 'reel-teeth spinning' : 'reel-teeth'}`}>
        <circle cx="12" cy="12" r="3" fill="#171310" />
        {[0, 60, 120, 180, 240, 300].map((deg) => (
          <rect key={deg} x="11.3" y="2.5" width="1.4" height="4" fill="#171310" transform={`rotate(${deg} 12 12)`} />
        ))}
      </svg>
    </div>
  );
}

function PopupContent(): React.ReactElement {
  const [activeTab, setActiveTab] = useState<MainTab>('session');
  const [showCachedDrawer, setShowCachedDrawer] = useState(false);
  const [showSettingsDrawer, setShowSettingsDrawer] = useState(false);
  const [cachedData, setCachedData] = useState<CachedQueueData | null>(null);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const loadHeaderState = async () => {
    try {
      const [storedQueue, session] = await Promise.all([getStoredCachedQueue(), getAuthSession()]);
      setCachedData(storedQueue);
      setCurrentUser(session.currentUser);
    } catch {}
  };

  useEffect(() => {
    loadHeaderState();
    const interval = setInterval(loadHeaderState, 3000);
    return () => clearInterval(interval);
  }, [refreshKey]);

  const isLive = !!cachedData && cachedData.count > 0;

  return (
    <div style={{ width: '380px' }} className="cassette-shell p-3 font-sans text-zinc-100 min-h-[520px] flex flex-col relative select-none rounded-2xl">
      {/* Case screws, purely decorative — sells the "physical deck" read */}
      <div className="absolute top-2 left-2 screw" />
      <div className="absolute top-2 right-2 screw" />
      <div className="absolute bottom-2 left-2 screw" />
      <div className="absolute bottom-2 right-2 screw" />

      {/* Tape window: brand + reels + live status, standing in for the old header */}
      <div className="tape-window rounded-xl p-3 mb-3 flex items-center justify-between">
        <Reel spinning={isLive} />

        <div className="flex-1 text-center px-2">
          <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-zinc-300 m-0 leading-none">
            Queue Saver
          </p>
          <p className="text-[9px] text-zinc-500 m-0 mt-1 leading-none font-mono">
            {currentUser ? 'Account connected' : 'C-90'}
          </p>
        </div>

        <Reel spinning={isLive} />
      </div>

      {/* Live tape pill + eject-to-settings, replacing the old icon header */}
      <div className="flex items-center gap-2 mb-3">
        <button
          onClick={() => setShowCachedDrawer(true)}
          className="transport-btn flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-[10px] cursor-pointer"
          title="Inspect the tape currently loaded in the deck"
        >
          <span className={`led ${isLive ? 'led-red led-pulse' : 'led-off'}`} />
          <span className="font-mono">{isLive ? `${cachedData!.count} loaded` : 'no tape loaded'}</span>
        </button>

        <button
          onClick={() => setShowSettingsDrawer((v) => !v)}
          className={`transport-btn shrink-0 px-3 py-1.5 rounded-md text-[10px] cursor-pointer ${
            showSettingsDrawer ? 'is-primary' : ''
          }`}
          title="Label editor"
        >
          <span aria-hidden>⏏</span> Label
        </button>
      </div>

      {/* Side A / Side B selector */}
      <div role="tablist" className="grid grid-cols-2 gap-1.5 mb-3">
        <TabButton
          label="Session"
          side="A"
          active={activeTab === 'session' && !showSettingsDrawer}
          onClick={() => {
            setActiveTab('session');
            setShowSettingsDrawer(false);
          }}
        />
        <TabButton
          label="Archive"
          side="B"
          active={activeTab === 'history' && !showSettingsDrawer}
          onClick={() => {
            setActiveTab('history');
            setShowSettingsDrawer(false);
          }}
        />
      </div>

      {/* Content */}
      <div className="flex-1">
        <ErrorBoundary>
          {showSettingsDrawer ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-white/5">
                <h2 className="text-xs font-bold text-zinc-200 uppercase tracking-wide m-0">Label editor</h2>
                <button
                  onClick={() => setShowSettingsDrawer(false)}
                  className="transport-btn text-xs px-2 py-0.5 rounded cursor-pointer"
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

      <CachedQueueDrawer
        isOpen={showCachedDrawer}
        onClose={() => setShowCachedDrawer(false)}
        onSnapshotSaved={() => setRefreshKey((k) => k + 1)}
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
