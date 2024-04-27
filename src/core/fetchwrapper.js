import { BASE_URL } from './configs.js'

export const request = async (path, options = {}) => {
  const fullUrl = `${BASE_URL}${path}`
  const interceptedOptions = await requestInterceptor(fullUrl, options)
  const response = await fetch(fullUrl, interceptedOptions)
  return await responseInterceptor(response)
}

async function requestInterceptor (url, options) {
  const token = await chrome.storage.local.get('userToken')
  options.headers = {
    'Authorization': `Bearer ${token?.userToken?.accessToken}`,
    ...options.headers,
  }
  return options
}

async function responseInterceptor (response) {
  const contentType = response.headers.get('Content-Type')
  if (response.status === 401) {
  // if (true) {
    const token = await chrome.storage.local.get('userToken')
    const newTokenResponse = await fetch(`${BASE_URL}/auth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: token.userToken.refreshToken }),
    })

    if (!newTokenResponse.ok) {
      await chrome.storage.local.remove('refreshToken')
      throw new Error('Failed to refresh token.')
    }

    const newToken = await newTokenResponse.json()

    await chrome.storage.local.set({ userToken: newToken })

    const retryResponse = await fetch(response.url, {
      method: response.request.method,
      headers: {
        ...response.request.headers,
        Authorization: `Bearer ${newToken.accessToken}`,
      },
    })

    return contentType.includes('application/json') ? await retryResponse.json() : retryResponse
  }
  return contentType.includes('application/json') ? await response.json() : response
}

const get = async (url, options = {}) => {
  return await request(url, { ...options, method: 'GET' })
}

const post = async (url, body = {}, options = {}) => {
  const headers = { 'Content-Type': 'application/json', ...options.headers }
  return await request(url, { ...options, method: 'POST', body: JSON.stringify(body), headers })
}

const put = async (url, body = {}, options = {}) => {
  const headers = { 'Content-Type': 'application/json', ...options.headers }
  return await request(url, { ...options, method: 'PUT', body: JSON.stringify(body), headers })
}

const _delete = async (url, options = {}) => {
  return await request(url, { ...options, method: 'DELETE' })
}

export default {
  get,
  post,
  put,
  _delete,
}