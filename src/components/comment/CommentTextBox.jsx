import CommentHeartRate from './CommentHeartRate.jsx'
import { useRecoilState } from 'recoil'
import { useCommentState, usePostComments } from '../../store/comment.js'

function CommentTextBox () {
  let dummy = [0, 1, 2, 3, 4]
  const [comment, setComment] = useRecoilState(useCommentState)
  const { postComments, isLoading, isError } = usePostComments()
  const handlePostComment = () => {
    console.log('click')
    postComments(comment)
    setComment('')
  }

  return (
    <>
      <div className="tw-w-full tw-mb-4 tw-border tw-border-gray-200 tw-rounded-lg tw-bg-gray-50">
        <div className="tw-px-4 tw-py-2 tw-bg-white tw-rounded-t-lg">
          <textarea
            id="TextBox"
            rows="4"
            className="tw-w-full tw-px-0 tw-text-sm tw-text-gray-900 tw-bg-white tw-border-0 focus:tw-ring-0 tw-resize-none tw-user-select-none"
            onChange={e => setComment(e.target.value)}
            value={comment}
            placeholder="리뷰를 작성하려면 로그인이 필요합니다."
            required></textarea>
        </div>
        <div className="tw-flex tw-items-center tw-justify-between tw-px-3 tw-py-2 tw-border-t">
          <div
            className="tw-inline-flex tw-items-center tw-py-2.5 tw-px-4 tw-text-xs tw-font-medium tw-text-center tw-text-white tw-rounded-lg">
            {
              dummy.map(el => (
                <CommentHeartRate
                  key={el}
                  // isOutline={!clicked[el]}
                  // onClick={() => handleStarClick(el)}
                  className="tw-h-5 tw-w-5 tw-text-main tw-cursor-pointer"
                />))
            }
          </div>
          <div className="tw-flex tw-pl-0 tw-space-x-1">
            <button
              className="tw-inline-flex tw-items-center tw-py-2.5 tw-px-4 tw-text-xs tw-font-medium tw-text-center tw-text-white tw-bg-main tw-rounded-lg focus:tw-ring-4 focus:tw-bg-secondary hover:tw-bg-secondary"
              onClick={handlePostComment}
            >
              리뷰쓰기
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

export default CommentTextBox
