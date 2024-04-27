import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import App from './App.jsx'

const commentRoot = document.getElementById('js-item-info-detail')
const root = document.createElement('div')
root.style = 'background: white;padding: 20px 32px 20px 32px'
root.id = 'crx-root'
commentRoot.after(root)

ReactDOM.createRoot(root).render(
  <>
    <App/>
  </>
)
