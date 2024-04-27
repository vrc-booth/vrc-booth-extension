import { atom } from 'recoil'
import { localStorageEffect } from './common.js'

const userTokenAtom = atom({
  key: 'userTokenAtom',
  default: null,
  effects: [localStorageEffect('userToken')]
})

const userInfoAtom = atom({
  key: 'userInfoAtom',
  default: null,
})

export {
  userTokenAtom,
  userInfoAtom,
}
