import { Config } from './config.js'

const messageMap = {
  auth: (request, sender, sendResponse) => {
    const authUrl = new URL(`${Config.BaseURL}/auth/oauth/discord`)
    const extensionUrl = new URL(`https://${chrome.runtime.id}.chromiumapp.org/`)
    authUrl.searchParams.set('redirectUrl', extensionUrl)
    chrome.identity.launchWebAuthFlow({
        url: authUrl.toString(),
        interactive: true,
      },
      function (redirectURL) {
        const code = new URL(redirectURL).searchParams.get('code')
        const callbackUrl = new URL(`${Config.BaseURL}/auth/oauth/discord/callback`)
        callbackUrl.searchParams.set('code', code)
        callbackUrl.searchParams.set('redirectUrl', extensionUrl)
        fetch(callbackUrl.toString())
          .then(response => response.json())
          .then(result => {
            chrome.storage.local.set({ 'authorization': result }, () => {
              sendResponse(result)
            })
          })
          .catch(error => {
            console.error('Error during token exchange:', error)
          })
      })
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (messageMap[request.message]) {
    messageMap[request.message](request, sender, sendResponse)
  } else {
    console.error('Invalid message type: ', request.message)
  }

  return true
})
