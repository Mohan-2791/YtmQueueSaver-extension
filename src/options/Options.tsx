import React from 'react';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { ToastProvider, useToast } from '../components/Toast';
import { SettingsForm } from '../components/SettingsForm';

function OptionsContent(): React.ReactElement {
  const { showToast } = useToast();

  return (
    <div className="max-w-md mx-auto p-8 font-sans text-zinc-100 min-h-screen">
      <div className="tape-window rounded-xl p-4 mb-6">
        <h2 className="text-sm font-bold uppercase tracking-[0.15em] text-zinc-200 m-0">Queue Saver</h2>
        <p className="text-[11px] text-zinc-500 m-0 mt-1">Label editor — full view</p>
      </div>
      <SettingsForm onSaved={() => showToast('Label saved.')} />
    </div>
  );
}

export default function Options(): React.ReactElement {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <OptionsContent />
      </ToastProvider>
    </ErrorBoundary>
  );
}
