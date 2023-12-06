import CommentTextBox from './components/comment/CommentTextBox.jsx'
import Auth from './components/auth/Auth.jsx'
import CommentList from './components/comment/CommentList.jsx'

function App () {
  return (
    <>
      <div>
        <h3 className="font-bold !m-0 !p-0 typography-16 preserve-half-leading">리뷰</h3>
        <div className="mt-8">
          <CommentList/>
          <Auth>
            <CommentTextBox/>
          </Auth>
        </div>
      </div>
    </>
  )
}

export default App
