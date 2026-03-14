import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { env } from '@xenova/transformers';

// Configure Transformers.js environment as early as possible
env.allowLocalModels = false;
env.allowRemoteModels = true;
env.useBrowserCache = true;
env.remoteHost = 'https://huggingface.co/';
env.remotePathTemplate = '{model}/resolve/{revision}/';

console.log("Transformers Global Env Initialized:", {
    allowLocalModels: env.allowLocalModels,
    remoteHost: env.remoteHost
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
