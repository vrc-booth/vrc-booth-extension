import { useRecoilState } from 'recoil'
import { userInfoState } from '../AppData/atoms.js'
import { getItemFromStorage, httpRequest } from '../AppData/apis.js'
import { useEffect, useState } from 'react'
import dayjs from 'dayjs'

function Auth () {
  const [userInfo, setUserInfo] = useRecoilState(userInfoState)
  const [isLoggedIn, setIsLoggedIn] = useState(false)

  const getUserInfo = async () => {
    httpRequest({
      message: 'http',
      data: {
        method: 'GET',
        uri: `/user/me`
      }
    }).then(user => {
      chrome.storage.session.set({ isLoggedIn: true }, function () {
        setUserInfo(user)
        setIsLoggedIn(true)
      })
    })
  }

  const Login = () => {
    chrome.runtime.sendMessage({ message: 'Auth' })
  }

  useEffect(() => {
    chrome.storage.session.get(['isLoggedIn'])
      .then(async (r) => {
        const result = await getUserInfo()
        setIsLoggedIn(result.isLoggedIn)
      })
  }, [])

  return (
    <>
      <div className="tw-w-[400px] tw-h-auto tw-border tw-border-gray-400">
        {
          (isLoggedIn != null || isLoggedIn) ?
          (
            <>
              <div className="tw-m-5"></div>
              <div className="tw-flex tw-flex-col tw-items-center tw-pb-10">
                <img className="tw-w-24 tw-h-24 tw-mb-3 tw-rounded-full tw-shadow-lg" src={userInfo.profileImage}/>
                <h5 className="tw-mb-1 tw-text-xl tw-font-medium tw-text-gray-900">{userInfo.name}</h5>
                <span className="text-sm tw-text-gray-500">{dayjs(userInfo.createdDate).format('YYYY-MM-DD')}</span>
              </div>
            </>
          ) :
          (
            <div className="tw-flex tw-justify-center tw-items-center tw-flex-col">
              <h3 className="tw-m-5">로그인을 하려면 아래 버튼을 눌러주세요.</h3>
              <button type="button"
                      className="tw-text-white tw-w-52 tw-bg-[#4285F4] hover:tw-bg-[#4285F4]/90 focus:tw-ring-4 focus:tw-outline-none focus:tw-ring-[#4285F4]/50 tw-font-medium tw-rounded-lg tw-text-sm tw-px-5 tw-py-2.5 tw-text-center tw-inline-flex tw-items-center tw-justify-between dark:tw-focus:ring-[#4285F4]/55 tw-m-5"
                      onClick={Login}>
                <svg className="tw-mr-2 -tw-ml-1 tw-w-4 tw-h-4" aria-hidden="true" focusable="false" data-prefix="fab"
                     data-icon="google"
                     role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 488 512">
                  <path fill="currentColor"
                        d="M488 261.8C488 403.3 391.1 504 248 504 110.8 504 0 393.2 0 256S110.8 8 248 8c66.8 0 123 24.5 166.3 64.9l-67.5 64.9C258.5 52.6 94.3 116.6 94.3 256c0 86.5 69.1 156.6 153.7 156.6 98.2 0 135-70.4 140.8-106.9H248v-85.3h236.1c2.3 12.7 3.9 24.9 3.9 41.4z"></path>
                </svg>
                Sign up with Google
              </button>
            </div>
          )
        }

      </div>
    </>
  )
}

export default Auth
