/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: '#080a0f',
        sidebar: 'rgba(15, 23, 42, 0.95)',
        card: 'rgba(30, 41, 59, 0.5)',
        'text-primary': '#f8fafc',
        'text-secondary': '#94a3b8',
        accent: '#6366f1',
        accentGlow: 'rgba(99, 102, 241, 0.3)',
        success: '#10b981',
        warning: '#f59e0b',
        danger: '#ef4444',
        glass: 'rgba(255, 255, 255, 0.03)',
        border: 'rgba(255, 255, 255, 0.08)',
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'sans-serif'],
      },
      spacing: {
        sidebar: '280px',
      },
      transitionProperty: {
        'all': 'all',
      },
      transitionTimingFunction: {
        'DEFAULT': 'cubic-bezier(0.4, 0, 0.2, 1)',
      },
      transitionDuration: {
        'DEFAULT': '300ms',
      },
    },
  },
  plugins: [],
}
