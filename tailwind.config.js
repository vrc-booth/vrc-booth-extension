/** @type {import('tailwindcss').Config} */

module.exports = {
  prefix: 'tw-',
  content: [
    './src/**/*.{js,jsx,ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        main: '#fc4d50',
        secondary: '#ff7e87'
      }
    },
  },
  safelist: [
    { pattern: /(bg|text|border)-(main|secondary)/ },
    { pattern: /([wh])-*/ },
  ],
  plugins: [
    require('daisyui')
  ],
  daisyui: {
    theme: ['light'],
  }
}