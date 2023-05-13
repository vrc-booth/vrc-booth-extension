import { selector } from 'recoil'
import { chromeSendMessage } from './apis.js'
import { pageState, pathNameState, triggerState } from './atoms.js'

export const reviewsSelector = selector({
  key: 'reviewsSelector',
  get: async ({ get }) => {
    get(triggerState('reviewsSelector'))
    const pathName = get(pathNameState)
    const splitUrl = pathName.split('/')
    const { page, pageSize } = get(pageState)

    return await chromeSendMessage({
      message: 'http',
      data: {
        method: 'GET',
        uri: `/post/${splitUrl[splitUrl.length - 1]}?page=${page}&pageSize=${pageSize}`
      }
    })
  },
  set: ({ set }) => {
    set(triggerState('reviewsSelector'), Date.now())
  }
})
