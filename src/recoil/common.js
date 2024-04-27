const localStorageEffect = (key) => {
  return ({ setSelf, onSet }) => {
    chrome.storage.local.get(key, (data) => {
      if (data) setSelf(data)
    })

    onSet((newValue, _, isReset) => {
      if (isReset) return chrome.storage.local.remove(key)
      return chrome.storage.local.set({ [key]: newValue })
    })
  }
}

export {
  localStorageEffect,
}