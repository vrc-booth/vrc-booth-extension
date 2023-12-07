import { atom, useRecoilValue, useSetRecoilState } from 'recoil'
import { useMutation, useQuery } from 'react-query'
import { useRecoilState } from 'recoil'
import { Configs } from '../AppData/configs.js'
import { Api } from '../AppData/api.js'

export const pageState = atom({
  key: 'pageState',
  default: 1
})

export const pageSizeState = atom({
  key: 'pageSizeState',
  default: 10
})

export const productIdState = atom({
  key: 'productIdState',
  default: window.location.href.split('/')[window.location.href.split('/').length - 1]
})

export const useCommentListAtom = atom({
  key: 'useCommentListAtom',
  default: {
    count: 0,
    comments: []
  }
})

export const useCommentState = atom({
  key: 'useCommentState',
  default: ''
})

export function useCommentPagination () {
  const setPage = useSetRecoilState(pageState)
  const setPageSize = useSetRecoilState(pageSizeState)

  return { setPage, setPageSize }
}

export function useFetchComments () {
  const [comments, setComments] = useRecoilState(useCommentListAtom)
  const page = useRecoilValue(pageState)
  const pageSize = useRecoilValue(pageSizeState)
  const productId = useRecoilValue(productIdState)

  const fetchComments = async () => {
    const response = await fetch(`${Configs.BaseURL}/comment?page=${page}&productId=${productId}`)
    return response.json()
  }

  const { data, isLoading, isError } = useQuery('comments', fetchComments, {
      onSuccess: (data) => {
        setComments(data)
      }
    }
  )

  return { comments, isLoading, isError }
}

export function usePostComments () {
  const productId = useRecoilValue(productIdState)

  const postComment = (message, rating) => {
    Api(`/comment/${productId}`, {
      method: 'POST',
      body: JSON.stringify({
        'content': message,
        'language': 'ko',
        'score': rating
      })
    })
  }

  const { mutate, isLoading, isError } = useMutation(postComment)

  return { postComment: mutate, isLoading, isError }
}