import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './styles.css'   // design PHP (www/styles.css) — classes .header, .stats-grid, .table-container, etc.
import './index.css'    // overrides layout React (sidebar sticky, app-shell flexbox)

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
