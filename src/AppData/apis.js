export const httpRequest = (options) => {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(options, response => {
      if (response.count > -1) resolve(response)
      else reject(response)
    })
  })
}