const BaseURL = process.env.NODE_ENV === 'production' ? 'https://vrc-booth.com/api' : 'https://vrc-booth.ribe.io/api'

const Configs = {
  BaseURL: BaseURL
}

const getObjectFromLocalStorage = async function (key) {
  return new Promise((resolve, reject) => {
    try {
      chrome.storage.local.get(key, function (value) {
        resolve(value[key])
      })
    } catch (ex) {
      reject(ex)
    }
  })
}

const saveObjectInLocalStorage = async function (obj) {
  return new Promise((resolve, reject) => {
    try {
      chrome.storage.local.set(obj, function () {
        resolve()
      })
    } catch (ex) {
      reject(ex)
    }
  })
}

const removeObjectFromLocalStorage = async function (keys) {
  return new Promise((resolve, reject) => {
    try {
      chrome.storage.local.remove(keys, function () {
        resolve()
      })
    } catch (ex) {
      reject(ex)
    }
  })
}

export {
  Configs,
  getObjectFromLocalStorage,
  saveObjectInLocalStorage,
  removeObjectFromLocalStorage
}