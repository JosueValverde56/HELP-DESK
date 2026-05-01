// frontend/tailwind.config.ts
import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}", // <-- VITAL: Sin esto no hay estilos en app
  ],
  theme: {
    extend: {
      colors: {
        'organic-green': '#4ade80',
        'soft-earth': '#fef3c7',
        'dark-forest': '#064e3b',
      },
      borderRadius: {
        'xl': '1.5rem',
        '2xl': '2rem',
      }
    },
  },
  plugins: [],
};
export default config;