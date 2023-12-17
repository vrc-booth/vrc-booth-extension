import {
  Config,
  getObjectFromLocalStorage,
  removeObjectFromLocalStorage,
  saveObjectInLocalStorage
} from './config.js'

export const callApi = async function (url, options = {}) {
  const defaultOptions = await setHeaders()
  const mergedOptions = {
    ...defaultOptions,
    ...options
  }

  try {
    const response = await fetch(`${Config.BaseURL}${url}`, mergedOptions)

    // Extracted 401 status handling
    return await handleUnAuthorizedResponse(url, mergedOptions, response)
  } catch (error) {
    throw new Error('Network error')
  }
}

async function validateAuthorization() {
  const authToken = await getObjectFromLocalStorage('authorization')

  if (!authToken?.accessToken) {
    throw {
      status: 999,
      message: 'Empty accessToken'
    }
  }

  return authToken
}

async function setHeaders() {
  const authToken = await validateAuthorization()

  return {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken?.accessToken}`
    }
  }
}

async function handleUnAuthorizedResponse(url, mergedOptions, response) {
  if (response.status === 401) {
    const authToken = await validateAuthorization()
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

    await saveObjectInLocalStorage({ 'authorization': tokenResponse.json() })
    return await callApi(url, mergedOptions)
  }

  return await response.json()
}

const refreshToken = async (token) => {
  return await fetch(`${Config.BaseURL}/auth/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(token)
  })
}