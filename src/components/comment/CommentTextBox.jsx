import CommentHeartRate from './CommentHeartRate.jsx'
import { useState } from 'react'
import { getMyComment, postComment, putComment, PRODUCT_ID } from '../../api/comments.js'
import { useQuery, useQueryClient } from '@tanstack/react-query'

function CommentTextBox () {
  const dummy = [0, 1, 2, 3, 4]
  const [rate, setRate] = useState(1)
  const [comment, setComment] = useState('')
  const queryClient = useQueryClient()

  const currentUser = queryClient.getQueryData(['userMe'])
  const { data, isPending, isError, error } = useQuery({
    queryKey: ['myComment', PRODUCT_ID()],
    queryFn: getMyComment,
  })

  const handleStarClick = (index) => {
    setRate(index + 1)
  }

  const handleCreateOrUpdateComment = async () => {
    if (!comment) return
    const payload = { message: comment, rate: rate * 2 }
    if (data?.comment) {
      await putComment(payload)
    } else {
      await postComment(payload)
    }
    queryClient.invalidateQueries({ queryKey: ['comments'] })
    setComment('')
    setRate(1)
  }

  const updateComment = (value) => {
    setComment(value)
  }

  return (
    <>
      <div className="tw-w-full tw-mb-4 tw-border tw-border-gray-200 tw-rounded-lg tw-bg-gray-50">
        <div className="tw-px-4 tw-py-2 tw-bg-white tw-rounded-t-lg">
          <textarea
            id="TextBox"
            rows="4"
            className="tw-w-full tw-px-0 tw-text-sm tw-text-gray-900 tw-bg-white tw-border-0 focus:tw-ring-0 tw-resize-none tw-user-select-none"
            onChange={e => updateComment(e.target.value)}
            value={comment.message}
            placeholder={currentUser ? '리뷰' : '리뷰를 작성하려면 로그인이 필요합니다.'}
            required></textarea>
        </div>
        <div className="tw-flex tw-items-center tw-justify-between tw-px-3 tw-py-2 tw-border-t">
          <div
            className="tw-inline-flex tw-items-center tw-py-2.5 tw-px-4 tw-text-xs tw-font-medium tw-text-center tw-text-white tw-rounded-lg">
            {
              dummy.map(el => (
                <CommentHeartRate
                  key={el}
                  isOutline={el >= rate}
                  onClick={() => handleStarClick(el)}
                  className="tw-h-5 tw-w-5 tw-text-main tw-cursor-pointer"
                />))
            }
          </div>
          <div className="tw-flex tw-pl-0 tw-space-x-1">
            <button
              className="tw-inline-flex tw-items-center tw-py-2.5 tw-px-4 tw-text-xs tw-font-medium tw-text-center tw-text-white tw-bg-main tw-rounded-lg focus:tw-ring-4 focus:tw-bg-secondary hover:tw-bg-secondary"
              onClick={handleCreateOrUpdateComment}
            >
              {data?.comment ? '리뷰수정' : '리뷰작성'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

export default CommentTextBox
