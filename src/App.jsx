import Auth from './components/auth/Auth.jsx'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RecoilRoot } from 'recoil'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import CommentList from './components/comment/CommentList.jsx'
import CommentTextBox from './components/comment/CommentTextBox.jsx'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 2,
      retryDelay: attempt => Math.min(attempt * 1000, 2000),
      staleTime: 1000 * 60 * 5,
      cacheTime: 1000 * 60 * 10,
    }
  }
})

function App () {
  return (
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <RecoilRoot>
          <ReactQueryDevtools initialIsOpen={false}/>
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
    </React.StrictMode>
  )
}

export default App
