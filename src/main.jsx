import React, { Suspense } from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import Auth from './Components/Auth.jsx'
import { RecoilRoot } from 'recoil'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <RecoilRoot>
      <Suspense fallback={<div>Loading...</div>}>
        <Auth/>
      </Suspense>
    </RecoilRoot>
  </React.StrictMode>,
)
