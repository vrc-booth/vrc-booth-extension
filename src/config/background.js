const baseURL = 'http://localhost:3000'

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.message) {
    case 'Auth':
      chrome.identity.getAuthToken({ interactive: true }, token => {
        let init = {
          method: 'GET',
          async: true,
          headers: {
            Authorization: 'Bearer ' + token,
            'Content-Type': 'application/json'
          },
          'contentType': 'json'
        }
        fetch(
          'https://www.googleapis.com/oauth2/v2/userinfo', init)
          .then(response => response.json())
          .then(data => {
            sendResponse({
              name: data.name,
              img: data.picture
            })
          })
      })
      break
    case 'http':
      chrome.identity.getAuthToken({ interactive: true }, token => {
        let init = {
          method: request.data.method,
          async: true,
          headers: {
            Authorization: 'Bearer ' + token,
            'Content-Type': 'application/json'
          },
          'contentType': 'json',
          body: JSON.stringify(request.data.body)
        }
        fetch(
          `${baseURL}${request.data.uri}`, init)
          .then(res => res.json())
          .then(data => {
            sendResponse(data)
          })
      })
      break
  }

  return true
})
