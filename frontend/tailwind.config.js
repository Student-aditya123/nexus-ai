/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        nexus: {
          bg: '#080b14',
          surface: '#0d1117',
          card: '#161b27',
          border: '#1e2535',
          hover: '#1a2030',
          accent: '#6366f1',
          'accent-glow': '#818cf8',
          'accent-dim': '#312e81',
          emerald: '#10b981',
          amber: '#f59e0b',
          rose: '#f43f5e',
          text: '#e2e8f0',
          muted: '#64748b',
          subtle: '#334155',
        },
      },
      fontFamily: {
        sans: ['Sora', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
        display: ['Space Grotesk', 'Sora', 'sans-serif'],
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-in-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'slide-in-right': 'slideInRight 0.3s ease-out',
        'pulse-glow': 'pulseGlow 2s ease-in-out infinite',
        'shimmer': 'shimmer 1.5s infinite',
        'typing': 'typing 1s steps(3) infinite',
      },
      keyframes: {
        fadeIn: { from: { opacity: 0 }, to: { opacity: 1 } },
        slideUp: { from: { opacity: 0, transform: 'translateY(12px)' }, to: { opacity: 1, transform: 'translateY(0)' } },
        slideInRight: { from: { opacity: 0, transform: 'translateX(-12px)' }, to: { opacity: 1, transform: 'translateX(0)' } },
        pulseGlow: { '0%,100%': { boxShadow: '0 0 15px rgba(99,102,241,0.3)' }, '50%': { boxShadow: '0 0 30px rgba(99,102,241,0.6)' } },
        shimmer: { '0%': { backgroundPosition: '-200% 0' }, '100%': { backgroundPosition: '200% 0' } },
        typing: { '0%,100%': { opacity: 1 }, '50%': { opacity: 0 } },
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-mesh': 'radial-gradient(at 40% 20%, hsla(228,100%,74%,0.08) 0px, transparent 50%), radial-gradient(at 80% 0%, hsla(189,100%,56%,0.06) 0px, transparent 50%), radial-gradient(at 0% 50%, hsla(355,100%,93%,0.04) 0px, transparent 50%)',
      },
      backdropBlur: { xs: '2px' },
      boxShadow: {
        'glow-sm': '0 0 10px rgba(99,102,241,0.3)',
        'glow-md': '0 0 20px rgba(99,102,241,0.4)',
        'glow-lg': '0 0 40px rgba(99,102,241,0.4)',
        'card': '0 4px 24px rgba(0,0,0,0.3)',
        'card-hover': '0 8px 32px rgba(0,0,0,0.4)',
      },
    },
  },
  plugins: [],
};
