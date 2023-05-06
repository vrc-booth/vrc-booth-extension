import Review from './Components/review.jsx'
import Pagination from './Components/pagination.jsx'
import ReviewTextBox from './Components/reviewTextBox.jsx'
import { useEffect, useState } from 'react'

function App () {
  const [data, setData] = useState({})
  const [page, setPage] = useState({ current: 1, pageSize: 5 })
  const splitUrl = window.location.pathname.split('/')

  useEffect(() => {
    chrome.runtime.sendMessage({
      message: 'http',
      data: {
        method: 'GET',
        uri: `/post/${splitUrl[splitUrl.length - 1]}?page=${page.current}&pageSize=${page.pageSize}`
      }
    }, response => { setData(response) })
  }, [page])

  return (
    <>
      <div>
        <h3 className="font-bold !m-0 !p-0 typography-16 preserve-half-leading">리뷰</h3>
        <div className="mt-8">
          <Review list={data.list}/>
          {
            data.count === 0 || <Pagination data={data} page={page} onButtonClick={(val) => setPage(val)}/>
          }
          <ReviewTextBox onButtonClick={(val) => setPage(val)}/>
        </div>
      </div>
    </>
  )
}

export default App
