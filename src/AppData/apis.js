export const httpRequest = (options) => {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(options, response => {
      resolve(response)
    })
  })
}