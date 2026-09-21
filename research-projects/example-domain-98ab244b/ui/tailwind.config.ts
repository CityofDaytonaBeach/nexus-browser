import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{ts,tsx,js,jsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        captured1: "rgb(0, 0, 0)",
        captured2: "rgb(51, 68, 136)"
      },
      fontFamily: {
        captured: ["system-ui","sans-serif"],
      },
    },
  },
  plugins: [],
} satisfies Config;
