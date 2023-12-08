import CommentTextBox from './components/comment/CommentTextBox.jsx'
import Auth from './components/auth/Auth.jsx'
import CommentList from './components/comment/CommentList.jsx'
import React from 'react'
import { QueryClient, QueryClientProvider } from 'react-query'
import { RecoilRoot } from 'recoil'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 20000
    }
  }
})

function App () {
  return (
    <>
      <React.StrictMode>
        <>
          <QueryClientProvider client={queryClient}>
            <RecoilRoot>
              {/*<Suspense fallback={<Loading/>}>*/}
              {/*  <App/>*/}
              {/*</Suspense>*/}
              <div>
                <h3 className="font-bold !m-0 !p-0 typography-16 preserve-half-leading">리뷰</h3>
                <div className="mt-8">
                  <CommentList/>
                  <Auth>
                    <CommentTextBox/>
                  </Auth>
                </div>
              </div>
            </RecoilRoot>
          </QueryClientProvider>
        </>
      </React.StrictMode>
    </>
  )
}

export default App
