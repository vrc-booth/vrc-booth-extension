// const baseURL = 'https://port-0-boothplussrv-687p2alhbu0pyg.sel4.cloudtype.app'
const baseURL = 'http://localhost:3000'

const getAuthToken = () => {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive: true }, token => {
      if (token) resolve(token)
      else reject(token)
    })
  })
}

const handleRequest = (request, sender, sendResponse) => {
  console.log(request)

  if (request && request.message != null) {
    if (request.message === 'Auth') {
      getAuthToken().then(token => {
        fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
          method: 'GET',
          async: true,
          headers: {
            Authorization: 'Bearer ' + token,
            'Content-Type': 'application/json'
          },
          'contentType': 'json'
        })
          .then(response => response.json())
          .then(({ name, picture }) => {
            sendResponse({ name: name, img: picture })
          })
      })
    } else if (request.message === 'http') {
      getAuthToken().then(token => {
        fetch(`${baseURL}${request.data.uri}`, {
          method: request.data.method,
          async: true,
          headers: {
            Authorization: 'Bearer ' + token,
            'Content-Type': 'application/json'
          },
          'contentType': 'json',
          body: JSON.stringify(request.data.body)
        })
          .then(response => response.json())
          .then(data => sendResponse(data))
      })
    }

    return true
  } else {
    sendResponse({ success: false, message: 'Invalid message Received' })
  }
}

chrome.runtime.onMessage.addListener(handleRequest)