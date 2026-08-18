/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        coop: {
          primary: '#1e3a8a',   // Deep Blue
          secondary: '#0284c7', // Sky Blue
          accent: '#15803d',    // Forest Green
          danger: '#b91c1c',    // Dark Red
          background: '#f8fafc' // Slate 50
        }
      }
    },
  },
  plugins: [],
}	

