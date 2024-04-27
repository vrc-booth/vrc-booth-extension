import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import App from './App.jsx'

const commentRoot = document.querySelector('.u-pt-600')
const root = document.createElement('div')
root.id = 'crx-root'
commentRoot.after(root)

ReactDOM.createRoot(root).render(
  <>
    <App/>
  </>
)
