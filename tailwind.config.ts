import type { Config } from 'tailwindcss';

// Dark-first product (D1/D2): dark mode is opted into via the `class` strategy so the app
// shell (Phase 4) can force it on by default rather than following OS preference alone.
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {},
  },
  plugins: [],
} satisfies Config;
