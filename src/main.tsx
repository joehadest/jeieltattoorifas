import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AuthProvider } from './lib/auth';
import './styles.css';
import './site-theme.css';
import './editor.css';
import './accounts.css';
import './payments.css';
import './admin-users.css';

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><AuthProvider><App /></AuthProvider></React.StrictMode>);
