
const multiItem = document.querySelector('.my-40').children[0]
const ellipse = document.querySelector('.js-ellip-switcher').cloneNode(true)
const description = document.querySelector('.main-info-column')

multiItem.style = 'display: none'
description.style = 'overflow: hidden;max-height: 400px;'
description.after(ellipse)

ellipse.addEventListener('click', () => {
  description.style = ''
  multiItem.style = 'display: inherit'
  ellipse.remove()
})