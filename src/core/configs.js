const BASE_URL = new URL('https://vrc-booth.com/api')
const PRODUCT_ID = window.location.href.split('/')[window.location.href.split('/').length - 1]

export {
  BASE_URL,
  PRODUCT_ID,
}