import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        display: ['var(--font-display)', 'serif'],
      },
      colors: {
        gold: {
          50: '#fbf8ed',
          100: '#f5edcc',
          200: '#ecda99',
          300: '#e1c062',
          400: '#d6a937',
          500: '#c8932a',
          600: '#a87623',
          700: '#7e561f',
          800: '#5b3e1c',
          900: '#3d2a17',
        },
      },
    },
  },
  plugins: [],
};
export default config;
