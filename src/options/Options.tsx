import React from 'react';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { ToastProvider, useToast } from '../components/Toast';
import { SettingsForm } from '../components/SettingsForm';

function OptionsContent(): React.ReactElement {
  const { showToast } = useToast();

  return (
    <div className="max-w-md mx-auto p-8 font-sans bg-zinc-950 text-zinc-100 min-h-screen">
      <h2 className="text-xl font-bold text-red-500 border-b border-zinc-800 pb-2 mb-6">
        YTM Queue Saver Configuration
      </h2>
      <SettingsForm onSaved={() => showToast('Settings saved!')} />
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
