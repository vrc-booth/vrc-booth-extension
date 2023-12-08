import { atom, useRecoilState } from 'recoil'

export const authState = atom({
  key: 'authState',
  default: null,
})

export const isAuthenticated = atom({
  key: 'isAuthenticated',
  default: false,
})

export const useAuth = () => {
  const [auth, setAuth] = useRecoilState(authState)
  const [authenticated, setAuthenticated] = useRecoilState(isAuthenticated)

  const login = async () => {
    if (authenticated) return

    chrome.runtime.sendMessage({ message: 'auth' }, (response) => {
      setAuth(response)
      setAuthenticated(true)
    })
  }

  return {
    auth,
    login,
  }
}