import { atom } from 'recoil'

const pageAtom = atom({
  key: 'pageAtom',
  default: 1
})

const pageSizeAtom = atom({
  key: 'pageSizeAtom',
  default: 10
})

export {
  pageAtom,
  pageSizeAtom,
}