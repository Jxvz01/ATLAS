/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        atlasBg: '#F5F7F9',
        atlasPanel: '#FFFFFF',
        atlasBorder: '#E3E8ED',
        atlasText: '#17212B',
        atlasMuted: '#64748B',
        atlasOrange: '#F26536',
        atlasRed: '#E23B3B',
        atlasAmber: '#F0A43A',
        atlasGreen: '#23966B',
        atlasBlue: '#3985C6',
      }
    },
  },
  plugins: [],
}
