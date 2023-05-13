import React, { Suspense } from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { RecoilRoot } from 'recoil'

const commentRoot = document.querySelector('.u-pt-600')
const root = document.createElement('div')
root.id = 'crx-root'
commentRoot.after(root)

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <>
      <RecoilRoot>
        <Suspense fallback={<div>Loading...</div>}>
          <App/>
        </Suspense>
      </RecoilRoot>
    </>
  </React.StrictMode>
)
