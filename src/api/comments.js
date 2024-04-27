import request from '../core/fetchwrapper.js'
import { PRODUCT_ID } from '../core/configs.js'

const getComments = async (page) => {
  return await request.get(`/comment?page=${page}&productId=${PRODUCT_ID}`)
}

const postComment = async (comment) => {
  await request.post(
    `/comment/${PRODUCT_ID}`,
    {
      'content': comment.message,
      'language': 'ko',
      'score': comment.rate
    }
  )
}

const deleteComment = async (productId) => {
  await request._delete(`/comment/${productId}`, { method: 'DELETE' })
}

export {
  getComments,
  postComment,
  deleteComment,
}