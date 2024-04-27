import { atom } from 'recoil'

const pageAtom = atom({
  key: 'pageAtom',
  default: 1
})

const pageSizeAtom = atom({
  key: 'pageSizeAtom',
  default: 10
})

const commentsAtom = atom({
  key: 'commentsAtom',
  default: {
    count: 0,
    comments: []
  }
})

const commentAtom = atom({
  key: 'commentAtom',
  default: {
    message: '',
    rate: 1
  }
})
export {
  pageAtom,
  pageSizeAtom,
  commentsAtom,
  commentAtom,
}