import dayjs from 'dayjs'
import CommentHeartRate from './CommentHeartRate.jsx'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getUserAvatar } from '../../api/users.js'
import { deleteComment, postCommentThumbsUp, postCommentThumbsDown } from '../../api/comments.js'
import ThumbsUp from '../svg/ThumbsUp.jsx'
import ThumbsDown from '../svg/ThumbsDown.jsx'

function CommentListItem (props) {
  const dummy = [0, 1, 2, 3, 4]
  const { id, user, content, score, updatedAt, upvotes, downvotes } = props.data
  const queryClient = useQueryClient()
  const currentUser = queryClient.getQueryData(['userMe'])
  const { data, isPending, isError, error } = useQuery({
    queryKey: ['avatar', user.id],
    queryFn: () => getUserAvatar(user.id),
  })

  const mutation = useMutation({
    mutationFn: deleteComment,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comments'] })
    },
  })

  const deleteCommentConfirm = async () => {
    if (confirm('삭제하시겠습니까?')) mutation.mutate()
  }

  const thumbsUpHandler = async () => {
    await postCommentThumbsUp(id)
    await queryClient.invalidateQueries({ queryKey: ['comments'] })
  }

  const thumbsDownHandler = async () => {
    await postCommentThumbsDown(id)
    await queryClient.invalidateQueries({ queryKey: ['comments'] })
  }

  return (
    <>
      <li className="tw-flex tw-gap-x-6 tw-py-5">
        <div className="tw-flex tw-gap-x-6 tw-py-5 tw-grow">
          <div className="tw-flex tw-gap-x-4 tw-flex-initial">
            <img className="tw-h-12 tw-w-12 tw-flex-none tw-rounded-full tw-bg-gray-50"
                 src={isError ? `https://raw.githubusercontent.com/vrc-booth/vrc-booth-extension/main/public/vrc_cat.png` : data} alt=""/>
            <div className="tw-min-w-0 tw-flex-auto">
              <p className="tw-text-sm tw-font-semibold tw-leading-6 tw-text-gray-900 tw-overflow-ellipsis">
                {user.username}
              </p>
              <p className="tw-mt-1 tw-truncate tw-text-xs tw-leading-5 tw-text-gray-500">
                {dayjs(updatedAt).format('YYYY-MM-DD')}
              </p>
              <div className="tw-mt-1 tw-truncate tw-text-xs tw-leading-5 tw-text-gray-500">
                <div className="tw-flex tw-gap-1">
                  <button className="tw-flex tw-items-center" onClick={thumbsUpHandler}>
                    <ThumbsUp width="14" height="14"/>{upvotes}
                  </button>
                  <button className="tw-flex tw-items-center" onClick={thumbsDownHandler}>
                    <ThumbsDown width="14" height="14"/>{downvotes}
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div className="tw-flex tw-flex-col tw-items-start tw-flex-1">
            <p className="">{content}</p>
          </div>
          <div className="tw-flex tw-flex-initial tw-flex-row">
            {dummy.map(el => (
              <CommentHeartRate key={el} isOutline={el > (score - 1) / 2} className="tw-h-5 tw-w-5 tw-text-main"/>))}
          </div>
          {
            user.id === currentUser?.id ?
              <div className="tw-flex tw-flex-initial tw-flex-row">
                <div role="button" className="tw-dropdown tw-dropdown-end">
                  <div tabIndex={0} role="button">
                    <svg xmlns="http://www.w3.org/2000/svg" height="16" width="4" viewBox="0 0 128 512">
                      <path
                        d="M64 360a56 56 0 1 0 0 112 56 56 0 1 0 0-112zm0-160a56 56 0 1 0 0 112 56 56 0 1 0 0-112zM120 96A56 56 0 1 0 8 96a56 56 0 1 0 112 0z"/>
                    </svg>
                  </div>
                  <ul tabIndex={0} className="tw-dropdown-content tw-z-[1] tw-menu tw-p-2 tw-shadow tw-rounded-box tw-w-52">
                    <li>
                      <div role="button" onClick={deleteCommentConfirm}>삭제</div>
                    </li>
                  </ul>
                </div>
              </div> :
              null
          }
        </div>
      </li>
    </>
  )
}

export default CommentListItem
