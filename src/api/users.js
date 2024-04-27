import request from '../core/fetchwrapper.js'

const getUserAvatar = async (userId) => {
  const response = await request.get(`/user/avatar/${userId}`)
  return response.url
}

const getUserMe = async () => {
  return await request.get('/user/me')
}

export {
  getUserAvatar,
  getUserMe,
}
