import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { PlusNoticeProvider } from './components/PlusNotice';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PlusNoticeProvider>
      <App />
    </PlusNoticeProvider>
  </StrictMode>,
);
