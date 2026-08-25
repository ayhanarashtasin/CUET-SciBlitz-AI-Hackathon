import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import { reportWebVitals } from './utils/reportWebVitals'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Report Core Web Vitals (LCP, CLS, FCP)
reportWebVitals();
