import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { getBridge } from './api';
import { App } from './App';
import './styles/app.css';

const container = document.getElementById('root');
if (!container) throw new Error('Root element missing');

createRoot(container).render(
  <StrictMode>
    <App api={getBridge()} />
  </StrictMode>,
);
