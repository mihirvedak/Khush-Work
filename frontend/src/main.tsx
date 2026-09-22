import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { applyFaclonTheme } from './theme/highcharts'
import App from './App.tsx'

applyFaclonTheme()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
