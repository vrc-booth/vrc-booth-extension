import request from '../core/fetchwrapper.js'

const PRODUCT_ID = () => {
  const currentUrl = new URL(window.location.href)
  return currentUrl.pathname.split('/')[currentUrl.pathname.split('/').length - 1]
}

const getComments = async (page) => {
  return await request.get(`/comment?page=${page}&productId=${PRODUCT_ID()}`)
}

const getMyComment = async () => {
  return await request.get(`/comment/${PRODUCT_ID()}/my`)
}

const postComment = async (comment) => {
  await request.post(
    `/comment/${PRODUCT_ID()}`,
    {
      'content': comment.message,
      'language': 'ko',
      'score': comment.rate
    }
  )
}

const deleteComment = async () => {
  await request._delete(`/comment/${PRODUCT_ID()}`, { method: 'DELETE' })
}

export {
  getComments,
  getMyComment,
  postComment,
  deleteComment,
}