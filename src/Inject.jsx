import React, { Suspense } from 'react'
import ReactDOM from 'react-dom/client'
import { RecoilRoot } from 'recoil'
import './index.css'
import App from './App.jsx'
import { QueryClient, QueryClientProvider } from 'react-query'

const commentRoot = document.querySelector('.u-pt-600')
const root = document.createElement('div')
root.id = 'crx-root'
commentRoot.after(root)

const queryClient = new QueryClient()

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <>
      <QueryClientProvider client={queryClient}>
        <RecoilRoot>
          {/*<Suspense fallback={<Loading/>}>*/}
          {/*  <App/>*/}
          {/*</Suspense>*/}
          <App/>
        </RecoilRoot>
      </QueryClientProvider>
    </>
  </React.StrictMode>
)
