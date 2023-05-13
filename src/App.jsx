import Review from './Components/review.jsx'
import Pagination from './Components/pagination.jsx'
import ReviewTextBox from './Components/reviewTextBox.jsx'
import { useRecoilValue } from 'recoil'
import { reviewsSelector } from './AppData/selectors.js'

function App () {
  const reviewData = useRecoilValue(reviewsSelector)

  return (
    <>
      <div>
        <h3 className="font-bold !m-0 !p-0 typography-16 preserve-half-leading">리뷰</h3>
        <div className="mt-8">
          <Review/>
          {reviewData.count === 0 || <Pagination/>}
          <ReviewTextBox/>
        </div>
      </div>
    </>
  )
}

export default App
