import AuthWithDiscord from './AuthWithDiscord.jsx'
import { useRecoilValue } from 'recoil'
import { useUser } from '../../store/user.js'
import { isAuthenticated } from '../../store/auth.js'

function Auth ({ children }) {
  const isLoggedIn = useRecoilValue(isAuthenticated)
  useUser()

  return (
    <>
      {isLoggedIn ?
        children :
        <div className="tw-relative">
          <div className="tw-absolute tw-inset-0 tw-flex tw-items-center tw-justify-center tw-filter-none tw-z-50">
            <AuthWithDiscord/>
          </div>
          <div className="tw-blur-sm tw-pointer-events-none">
            {children}
          </div>
        </div>
      }
    </>
  )
}

export default Auth
