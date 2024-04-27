import CommentListItem from './CommentListItem.jsx'
import { useRecoilState, useRecoilValue } from 'recoil'
import { pageAtom, pageSizeAtom } from '../../recoil/comments.js'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getComments } from '../../api/comments.js'

function CommentList () {
  const [page, setPage] = useRecoilState(pageAtom)
  const pageSize = useRecoilValue(pageSizeAtom)
  const queryClient = useQueryClient()
  const { data, isPending, isError, error } = useQuery({
    queryKey: ['comments'],
    queryFn: () => getComments(page),
  })

  const handlePageChange = (newPage) => {
    setPage(newPage)
    queryClient.invalidateQueries({ queryKey: ['comments'] })
  }

  if (isPending) {
    return (
      <div className="tw-flex tw-gap-x-6 tw-py-5 tw-justify-center">
        <span className="tw-text-gray-400">
          Loading...
        </span>
      </div>
    )
  }

  if (!data || data?.count === 0) {
    return (
      <div className="tw-flex tw-gap-x-6 tw-py-5 tw-justify-center">
        <span className="tw-text-gray-400">
          No Data
        </span>
      </div>
    )
  }

  return (
    <>
      <ul role="list" className="tw-divide-y tw-divide-gray-100">
        {data?.comments.map((comment) => (<CommentListItem data={comment} key={comment.id}/>))}
      </ul>
      <div className="tw-flex tw-justify-center tw-mt-4 tw-mb-4">
        {[...Array(Math.ceil(data.count / pageSize)).keys()].map((p) => (
          <button
            key={p}
            onClick={() => handlePageChange(p + 1)}
            className={`tw-mx-2 tw-px-4 tw-py-2 tw-rounded ${page === p + 1 ? 'tw-bg-main tw-text-white' : 'tw-bg-gray-300'}`}
          >
            {p + 1}
          </button>
        ))}
      </div>
    </>
  )
}

export default CommentList
