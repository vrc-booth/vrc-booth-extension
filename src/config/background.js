chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.message) {
    case 'Auth':
      chrome.identity.getAuthToken({ interactive: true }, function (token) {
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
          .then((response) => response.json())
          .then(function (data) {
            sendResponse({
              name: data.name,
              img: data.picture
            })
          })
      })
      break
  }
})