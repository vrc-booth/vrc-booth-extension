
const multiItem = document.querySelector('.my-40').children[0]
const ellipse = document.querySelector('.js-ellip-switcher').cloneNode(true)
const description = document.querySelector('.main-info-column')

console.log(multiItem)

if (multiItem != null) multiItem.style = 'display: none'

if (description != null) {
  description.style = 'overflow: hidden;max-height: 400px;'
  description.after(ellipse)
}

ellipse.addEventListener('click', () => {
  if (description != null) description.style = ''
  if (multiItem != null) multiItem.style = 'display: inherit'
  ellipse.remove()
})