import React from 'react';
import { SettingsForm } from '../components/SettingsForm';
import { useToast } from '../components/Toast';

/** Popup-sized wrapper around the shared settings form. */
export function SettingsView(): React.ReactElement {
  const { showToast } = useToast();

  return <SettingsForm onSaved={() => showToast('Settings saved!')} />;
}
