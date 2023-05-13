import React, { Suspense } from 'react'
import ReactDOM from 'react-dom/client'
import { RecoilRoot } from 'recoil'
import './index.css'
import App from './App.jsx'
import Loading from './Loading.jsx'

const commentRoot = document.querySelector('.u-pt-600')
const root = document.createElement('div')
root.id = 'crx-root'
commentRoot.after(root)

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <>
      <RecoilRoot>
        <Suspense fallback={<Loading/>}>
          <App/>
        </Suspense>
      </RecoilRoot>
    </>
  </React.StrictMode>
)
