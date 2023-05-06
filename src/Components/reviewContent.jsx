import Heart from './heart.jsx'
import dayjs from 'dayjs'

function ReviewContent (props) {
  const dummy = [0, 1, 2, 3, 4]
  const { COMMENT, RATING, CREATED_DATE, NAME, PROFILE_IMAGE } = props.data

  return (
    <>
      <li className="tw-flex tw-gap-x-6 tw-py-5">
        <div className="tw-flex tw-gap-x-4 tw-flex-initial">
          <img className="tw-h-12 tw-w-12 tw-flex-none tw-rounded-full tw-bg-gray-50"
               src={PROFILE_IMAGE}
               alt=""/>
          <div className="tw-min-w-0 tw-flex-auto">
            <p className="tw-text-sm tw-font-semibold tw-leading-6 tw-text-gray-900">{NAME}</p>
            <p className="tw-mt-1 tw-truncate tw-text-xs tw-leading-5 tw-text-gray-500">{dayjs(CREATED_DATE).format('YYYY-MM-DD')}</p>
          </div>
        </div>
        <div className="tw-flex tw-flex-col tw-items-start tw-flex-1">
          <p className="">{COMMENT}</p>
        </div>
        <div className="tw-flex tw-flex-initial tw-flex-row">
          {
            dummy.map(el => (
              <Heart
                key={el}
                isOutline={el > (RATING - 1)}
                className="tw-h-5 tw-w-5 tw-text-main"
              />))
          }
        </div>
      </li>
    </>
  )
}

export default ReviewContent