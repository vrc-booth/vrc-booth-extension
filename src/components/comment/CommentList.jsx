import { useFetchComments } from '../../store/comment.js'
import CommentListItem from './CommentListItem.jsx'

function CommentList () {
  const { comments, isLoading, isError } = useFetchComments()


  const noData = (
    <div className="tw-flex tw-gap-x-6 tw-py-5 tw-justify-center">
            <span className="tw-text-gray-400">
              No Data
            </span>
    </div>
  )

  return (
    <>
      <ul role="list" className="tw-divide-y tw-divide-gray-100">
        {
          comments.count === 0 ? noData :
            comments?.comments.map((comment) => (
              <CommentListItem data={comment} key={comment.id}/>
            ))
        }
      </ul>
    </>
  )
}

export default CommentList
