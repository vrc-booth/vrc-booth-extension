import dayjs from 'dayjs'
import CommentHeartRate from './CommentHeartRate.jsx'
import { useState } from 'react'
import { useQuery } from 'react-query'
import { Configs } from '../../AppData/configs.js'

function CommentListItem (props) {
  const dummy = [0, 1, 2, 3, 4]
  const { user, content, score, updatedAt } = props.data
  const [avatar, setAvatar] = useState('')

  const fetchAvatar = async () => {
    const response = await fetch(`${Configs.BaseURL}/user/avatar/${user.id}`)
    return response.url
  }

  const { data, error, isLoading } = useQuery(`avatar_${user.id}`, fetchAvatar, {
    onSuccess: (data) => {
      setAvatar(data)
    },
  })

  return (
    <>
      <li className="tw-flex tw-gap-x-6 tw-py-5">
        <div className="tw-flex tw-gap-x-6 tw-py-5 tw-grow">
          <div className="tw-flex tw-gap-x-4 tw-flex-initial">
            <img className="tw-h-12 tw-w-12 tw-flex-none tw-rounded-full tw-bg-gray-50"
                 src={avatar}
                 alt=""/>
            <div className="tw-min-w-0 tw-flex-auto">
              <p className="tw-text-sm tw-font-semibold tw-leading-6 tw-text-gray-900">{user.username}</p>
              <p
                className="tw-mt-1 tw-truncate tw-text-xs tw-leading-5 tw-text-gray-500">{dayjs(updatedAt).format('YYYY-MM-DD')}</p>
            </div>
          </div>
          <div className="tw-flex tw-flex-col tw-items-start tw-flex-1">
            <p className="">{content}</p>
          </div>
          <div className="tw-flex tw-flex-initial tw-flex-row">
            {
              dummy.map(el => (
                <CommentHeartRate
                  key={el}
                  isOutline={el > (score - 1)}
                  className="tw-h-5 tw-w-5 tw-text-main"
                />))
            }
          </div>
        </div>
      </li>
    </>
  )
}

export default CommentListItem
