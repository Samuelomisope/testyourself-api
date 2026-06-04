import ReactDom from 'react-dom/client'
import React from 'react';
import './index.css'
import App from './App.jsx'
import { AuthProvider } from './AuthProvider.jsx';
import { DarkModeProvider } from './DarkModeContext.jsx';

ReactDom.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <DarkModeProvider>
        <App />
      </DarkModeProvider>
    </AuthProvider>
  </React.StrictMode>,
)

