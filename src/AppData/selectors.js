import { selector } from 'recoil'
import { httpRequest } from './apis.js'
import { pageState, pathNameState, triggerState } from './atoms.js'

export const reviewsSelector = selector({
  key: 'reviewsSelector',
  get: async ({ get }) => {
    get(triggerState('reviewsSelector'))
    const pathName = get(pathNameState)
    const splitUrl = pathName.split('/')
    const { page, pageSize } = get(pageState)

    return await httpRequest({
      message: 'http',
      data: {
        method: 'GET',
        uri: `/post/${splitUrl[splitUrl.length - 1]}?page=${page}&pageSize=${pageSize}`
      }
    })
  },
  set: ({ set }) => {
    set(triggerState('reviewsSelect'), Date.now())
  }
})
