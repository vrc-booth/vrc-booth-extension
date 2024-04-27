import AuthWithDiscord from './AuthWithDiscord.jsx'
import { useQuery } from '@tanstack/react-query'
import { getUserMe } from '../../api/users.js'

function Auth ({ children }) {
  const { data, isPending, isError, error } = useQuery({
    queryKey: ['userMe'],
    queryFn: getUserMe,
  })

  return (
    <>
      {isPending || isError ?
        <div className="tw-relative">
          <div className="tw-absolute tw-inset-0 tw-flex tw-items-center tw-justify-center tw-filter-none tw-z-50">
            <AuthWithDiscord/>
          </div>
          <div className="tw-blur-sm tw-pointer-events-none">
            {children}
          </div>
        </div> :
        children
      }
    </>
  )
}

export default Auth
