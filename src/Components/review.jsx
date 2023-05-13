import ReviewContent from './reviewContent.jsx'
import { useRecoilValue } from 'recoil'
import { reviewsSelector, userInfoSelector } from '../AppData/selectors.js'

function Review () {
  const reviewData = useRecoilValue(reviewsSelector)
  const userInfo = useRecoilValue(userInfoSelector)

  return (
    <>
      <ul role="list" className="tw-divide-y tw-divide-gray-100">
        {
          reviewData?.list?.map(content => (
            <ReviewContent data={content} key={content.id} displayDeleteButton={userInfo?.userId} />
          ))
        }
        {
          reviewData?.list?.length > 0 ||
          <div className="tw-flex tw-gap-x-6 tw-py-5 tw-justify-center">
            <span className="tw-text-gray-400">
              No Data
            </span>
          </div>
        }
      </ul>
    </>
  )
}

export default Review
