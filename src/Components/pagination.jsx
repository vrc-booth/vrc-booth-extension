import { useRecoilState, useRecoilValue } from 'recoil'
import { pageState } from '../AppData/atoms.js'
import { reviewsSelector } from '../AppData/selectors.js'

function Pagination () {
  const [page, setPage] = useRecoilState(pageState)
  const data = useRecoilValue(reviewsSelector)

  const totalPage = Math.ceil(data?.count / page.pageSize)
  const buttonRender = () => {
    const arr = []
    for (let i = 0; i < totalPage; i++) {
      arr.push(i + 1)
    }
    return arr
  }

  const notSelectedPage =
    `tw-relative tw-inline-flex tw-items-center tw-px-4 tw-py-2 tw-text-sm tw-font-semibold tw-text-gray-900 tw-ring-1
     tw-ring-inset tw-ring-gray-300 hover:tw-bg-secondary focus:tw-z-20 focus:tw-outline-offset-0 tw-cursor-pointer`

  const selectedPage = `tw-relative tw-z-10 tw-inline-flex tw-items-center tw-bg-main tw-px-4 tw-py-2
   tw-text-sm tw-font-semibold tw-text-white focus:tw-z-20 focus-visible:tw-outline focus-visible:tw-outline-2
    focus-visible:tw-outline-offset-2 focus-visible:tw-outline-secondary-600 tw-cursor-pointer`

  return (
    <>
      <div
        className="tw-flex tw-items-center tw-justify-between tw-border-t tw-border-gray-200 tw-bg-white tw-px-4 tw-py-3">
        <div className="tw-flex tw-flex-1 tw-items-center tw-justify-between">
          <div>
            <p className="tw-text-sm tw-text-gray-700">
              총 <span className="tw-font-medium">{data?.count}</span>개 리뷰
            </p>
          </div>
          <div>
            <nav className="tw-isolate tw-inline-flex -tw-space-x-px tw-rounded-md tw-shadow" aria-label="Pagination">
              <div
                className="tw-relative tw-inline-flex tw-items-center tw-rounded-l-md tw-px-2 tw-py-2 tw-text-gray-400 tw-ring-1 tw-ring-inset tw-ring-gray-300 hover:tw-bg-gray-50 focus:tw-z-20 focus:tw-outline-offset-0 tw-cursor-pointer">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5}
                     stroke="currentColor" className="tw-w-5 tw-h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5"/>
                </svg>
              </div>
              {
                buttonRender().map(el => (
                  <div className={el === page.page ? selectedPage : notSelectedPage}
                       key={el}
                       onClick={() => setPage({ page: el, pageSize: 5 })}
                  >
                    {el}
                  </div>
                ))
              }
              <div
                className="tw-relative tw-inline-flex tw-items-center tw-rounded-r-md tw-px-2 tw-py-2 tw-text-gray-400 tw-ring-1 tw-ring-inset tw-ring-gray-300 hover:tw-bg-gray-50 focus:tw-z-20 focus:tw-outline-offset-0 tw-cursor-pointer">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5}
                     stroke="currentColor" className="tw-w-5 tw-h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5"/>
                </svg>
              </div>
            </nav>
          </div>
        </div>
      </div>
    </>
  )
}

export default Pagination
