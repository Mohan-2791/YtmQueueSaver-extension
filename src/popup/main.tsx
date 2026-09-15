import React from 'react';
import ReactDOM from 'react-dom/client';
import Popup from './Popup';
import '../styles/globals.css';

const container = document.getElementById('root');
if (!container) throw new Error('Root element not found');

ReactDOM.createRoot(container).render(
  <React.StrictMode>
    <Popup />
  </React.StrictMode>,
);
