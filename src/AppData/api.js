import {
  Configs,
  getObjectFromLocalStorage,
  removeObjectFromLocalStorage,
  saveObjectInLocalStorage
} from './configs.js'

export const Api = async function (url, options = {}) {
  const authToken = await getObjectFromLocalStorage('authorization')
  if (!authToken?.accessToken) return {
    status: 999,
    message: 'Empty accessToken'
  }

  const defaultOptions = {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken?.accessToken}`
    },
  }

  const mergedOptions = {
    ...defaultOptions,
    ...options,
  }

  const response = await fetch(`${Configs.BaseURL}${url}`, mergedOptions)

  if (response.status === 401) {
    const tokenResponse = await refreshToken({
      refreshToken: authToken?.refreshToken
    })

    if (tokenResponse.status === 401) {
      await removeObjectFromLocalStorage('authorization')
      return {
        status: 999,
        message: 'refreshToken Expired'
      }
    }

    saveObjectInLocalStorage({'authorization': tokenResponse.json()})
      .then(() => {
        Api(url, mergedOptions)
      })
  }

  return response.json()
}

const refreshToken = async (token) => {
  return await fetch(`${Configs.BaseURL}/auth/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(token)
  })
}