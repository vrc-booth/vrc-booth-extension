import ReviewContent from './reviewContent.jsx'

function Review (props) {
  return (
    <>
      <ul role="list" className="tw-divide-y tw-divide-gray-100">
        {
          props?.list?.map(content => (
            <ReviewContent data={content}/>
          ))
        }
        {
          props?.list?.length > 0 ||
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