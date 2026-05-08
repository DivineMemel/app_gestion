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
      letterSpacing: {
        editorial: '0.18em',
        wider: '0.28em',
      },
      maxWidth: {
        editorial: '72ch',
      },
    },
  },
  plugins: [],
};
export default config;
