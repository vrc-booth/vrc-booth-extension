function Auth () {
  const Login = () => {
    chrome.identity.getAuthToken({ interactive: true }, function (token) {
      console.log(token)
      let init = {
        method: 'GET',
        async: true,
        headers: {
          Authorization: 'Bearer ' + token,
          'Content-Type': 'application/json'
        },
        'contentType': 'json'
      }
      fetch(
        'https://people.googleapis.com/v1/contactGroups/all?maxMembers=20&key=API_KEY',
        init)
        .then((response) => response.json())
        .then(function (data) {
          console.log(data)
        })
    })
  }

  return (
    <>
      <div className="tw-px-0 tw-max-w-sm">
        <button type="button"
                className="tw-text-white tw-w-full tw-bg-[#4285F4] hover:tw-bg-[#4285F4]/90 focus:tw-ring-4 focus:tw-outline-none focus:tw-ring-[#4285F4]/50 tw-font-medium tw-rounded-lg tw-text-sm tw-px-5 tw-py-2.5 tw-text-center tw-inline-flex tw-items-center tw-justify-between dark:tw-focus:ring-[#4285F4]/55 tw-mr-2 tw-mb-2"
                onClick={Login}>
          <svg className="tw-mr-2 -tw-ml-1 tw-w-4 tw-h-4" aria-hidden="true" focusable="false" data-prefix="fab"
               data-icon="google"
               role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 488 512">
            <path fill="currentColor"
                  d="M488 261.8C488 403.3 391.1 504 248 504 110.8 504 0 393.2 0 256S110.8 8 248 8c66.8 0 123 24.5 166.3 64.9l-67.5 64.9C258.5 52.6 94.3 116.6 94.3 256c0 86.5 69.1 156.6 153.7 156.6 98.2 0 135-70.4 140.8-106.9H248v-85.3h236.1c2.3 12.7 3.9 24.9 3.9 41.4z"></path>
          </svg>
          Sign up with Google
        </button>
      </div>
    </>
  )
}

export default Auth