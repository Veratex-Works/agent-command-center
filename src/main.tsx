import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// StrictMode off: dev double-mount ran effect cleanup and closed the WS while CONNECTING.
createRoot(document.getElementById('root')!).render(<App />)
