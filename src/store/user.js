import { atom, useSetRecoilState } from 'recoil'
import { useQuery } from 'react-query'
import { isAuthenticated } from './auth.js'
import { callApi } from '../AppData/api.js'

export const userState = atom({
  key: 'userState',
  default: null,
})

export const useUser = () => {
  const setUser = useSetRecoilState(userState)
  const setIsLoggedIn = useSetRecoilState(isAuthenticated)

  const getMe = async () => {
    return await callApi('/user/me')
  }

  const { data, isLoading, isError } = useQuery('user', getMe, {
    onSuccess: (data) => {
      setUser(data)
      setIsLoggedIn(data?.status !== 999)
    },
    onError: (err) => {
      console.log(err)
      setIsLoggedIn(false)
    }
  })

  return { data, isLoading, isError }
}