import { atom, atomFamily } from 'recoil'

export const pageState = atom({
  key: 'pageState',
  default: {
    page: 1,
    pageSize: 5
  },
})

export const pathNameState = atom({
  key: 'pathNameState',
  default: window.location.pathname
})

export const triggerState = atomFamily({
  key: 'triggerState',
  default: Date.now()
})

export const userInfoState = atom({
  key: 'userInfoState',
  default: {
    id: 0,
    userId: '',
    name: '',
    email: '',
    profileImage: '',
    createdDate: ''
  }
})