import React from 'react';
import ReactDOM from 'react-dom/client';
import 'antd/dist/reset.css';
import './theme/global.css';
import App from './App';
import { ThemeProvider } from './theme';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </React.StrictMode>,
);
