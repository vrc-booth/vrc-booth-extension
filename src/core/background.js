import { BASE_URL } from './configs.js'

const handleAuthFlow = (request, sender, sendResponse) => {
  const authUrl = new URL(`${BASE_URL}/auth/oauth/discord`)
  const extensionUrl = new URL(`https://${chrome.runtime.id}.chromiumapp.org/`)
  authUrl.searchParams.set('redirectUrl', extensionUrl.toString())
  chrome.identity.launchWebAuthFlow({
    url: authUrl.toString(),
    interactive: true,
  }, (redirectURL) => {
    const code = new URL(redirectURL).searchParams.get('code')
    const callbackUrl = new URL(`${BASE_URL}/auth/oauth/discord/callback`)
    callbackUrl.searchParams.set('code', code)
    callbackUrl.searchParams.set('redirectUrl', extensionUrl.toString())
    fetch(callbackUrl)
      .then(response => response.json())
      .then(response => sendResponse(response))
      .catch(error => sendResponse(error))
  })
}

const functionMap = {
  'auth': handleAuthFlow,
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!functionMap[message.message]) return sendResponse(null)
  functionMap[message.message](message.data, sender, sendResponse)
  return true
})