import Review from './Components/review.jsx'
import Heart from './Components/heart.jsx'
import Pagination from './Components/pagination.jsx'
import ReviewTextBox from './Components/reviewTextBox.jsx'

function App() {
  return (
    <>
      <div>
        <h3 className="font-bold !m-0 !p-0 typography-16 preserve-half-leading">리뷰</h3>
        <div className="mt-8">
          <Review/>
          <Pagination/>
          <ReviewTextBox/>
        </div>
      </div>
    </>
  )
}

export default App
