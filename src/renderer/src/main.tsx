import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { getBridge } from './api';
import { App } from './App';
// Persian typeface (SIL Open Font License 1.1), bundled locally; used only for `lang="fa"`.
import '@fontsource-variable/vazirmatn/index.css';
import './styles/app.css';

const container = document.getElementById('root');
if (!container) throw new Error('Root element missing');

createRoot(container).render(
  <StrictMode>
    <App api={getBridge()} />
  </StrictMode>,
);
