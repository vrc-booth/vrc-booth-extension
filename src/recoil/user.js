import { atom } from 'recoil'

const userInfoAtom = atom({
  key: 'userInfoAtom',
  default: null,
})

export {
  userInfoAtom,
}
