import { Configs } from './configs.js'

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.message === 'auth') {
    chrome.identity.launchWebAuthFlow({
        url: `${Configs.BaseURL}/auth/popup/discord`,
        interactive: true,
      },
      function (redirectURL) {
        console.log('OAuth 인증 완료:', redirectURL)
      })
  }
})
