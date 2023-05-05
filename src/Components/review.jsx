import Heart from './heart.jsx'

function Review (props) {

  return (
    <>
      <ul role="list" className="tw-divide-y tw-divide-gray-100">
        <li className="tw-flex tw-gap-x-6 tw-py-5">
          <div className="tw-flex tw-gap-x-4 tw-flex-initial">
            <img className="tw-h-12 tw-w-12 tw-flex-none tw-rounded-full tw-bg-gray-50"
                 src="https://asset.booth.pm/assets/thumbnail_placeholder_f_150x150-73e650fbec3b150090cbda36377f1a3402c01e36ff9fa96158de6016fa067d01.png" alt=""/>
            <div className="tw-min-w-0 tw-flex-auto">
              <p className="tw-text-sm tw-font-semibold tw-leading-6 tw-text-gray-900">유짜이</p>
              <p className="tw-mt-1 tw-truncate tw-text-xs tw-leading-5 tw-text-gray-500">1일전</p>
            </div>
          </div>
          <div className="tw-flex tw-flex-col tw-items-start tw-flex-1">
            <p className="">댓글 1</p>
          </div>
          <div className="tw-flex tw-flex-initial tw-flex-row">
            <Heart isOutline={false} className="tw-h-5 tw-w-5 tw-text-main"/>
            <Heart isOutline={false} className="tw-h-5 tw-w-5 tw-text-main"/>
            <Heart isOutline={true} className="tw-h-5 tw-w-5 tw-text-main"/>
            <Heart isOutline={true} className="tw-h-5 tw-w-5 tw-text-main"/>
            <Heart isOutline={true} className="tw-h-5 tw-w-5 tw-text-main"/>
          </div>
        </li>
      </ul>
    </>
  )
}

export default Review