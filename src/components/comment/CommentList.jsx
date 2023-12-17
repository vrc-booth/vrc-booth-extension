import { pageSizeState, pageState, useCommentPagination, useFetchComments } from '../../store/comment.js'
import CommentListItem from './CommentListItem.jsx'
import { useRecoilValue } from 'recoil'
import { useQueryClient } from 'react-query'

function CommentList () {
  const queryClient = useQueryClient()
  const page = useRecoilValue(pageState)
  const pageSize = useRecoilValue(pageSizeState)
  const { comments } = useFetchComments()
  const { setPage } = useCommentPagination()

  const handlePageChange = (newPage) => {
    setPage(newPage)
    queryClient.refetchQueries('comments')
  }

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
      <div className="tw-flex tw-justify-center tw-mt-4 tw-mb-4">
        {[...Array(Math.ceil(comments.count / pageSize)).keys()].map((p) => (
          <button
            key={p}
            onClick={() => handlePageChange(p + 1)}
            className={`tw-mx-2 tw-px-4 tw-py-2 tw-rounded ${
              page === p + 1 ? 'tw-bg-main tw-text-white' : 'tw-bg-gray-300'
            }`}
          >
            {p + 1}
          </button>
        ))}
      </div>
    </>
  )
}

export default CommentList
