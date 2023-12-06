import { atom, useSetRecoilState } from 'recoil'
import { useMutation, useQuery } from 'react-query'
import { Configs } from '../AppData/configs.js'

export const userState = atom({
  key: 'userState',
  default: null,
})

export const isLoggedInState = atom({
  key: 'isLoggedInState',
  default: false,
})

export const useUser = () => {
  const setUser = useSetRecoilState(userState)
  const setIsLoggedIn = useSetRecoilState(isLoggedInState)

  const getMe = async () => {
    const response = await fetch(`${Configs.BaseURL}/user/me`, {
      credentials: 'include',
    })
    return response.json()
  }

  const { data, isLoading, isError } = useQuery('user', getMe, {

    onSuccess: (data) => {
      setUser(data)
      setIsLoggedIn(data.statusCode !== 401)
    },
    onError: () => {
      console.log('d')
      setIsLoggedIn(false)
    }
  })

  return { data, isLoading, isError }
}