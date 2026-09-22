/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        azure: { 50: '#EEF3FF', 100: '#DCE6FE', 200: '#B8CCFD', 500: '#3B72F5', 600: '#1655F2', 700: '#0F43C4' },
        navy: { 900: '#132335', 950: '#0B1622', footer: '#192839' },
        ink: '#0C1927',
        highlight: '#00EA5F',
        canvas: 'var(--bg-canvas)',
        surface: 'var(--bg-surface)',
        subtle: 'var(--bg-subtle)',
        line: 'var(--border)',
        txt: { primary: 'var(--text-primary)', secondary: 'var(--text-secondary)', muted: 'var(--text-muted)' },
        st: {
          run: '#1E9E5A', micro: '#F2B632', down: '#E5484D', plan: '#6E56CF',
          idle: '#8B98A9', hold: '#EA7A1A', nosch: '#E3E8EF', disc: '#5B6776',
        },
        ok: '#1E9E5A',
        warn: { DEFAULT: '#B7791F', bg: '#FDF3D8' },
        danger: { DEFAULT: '#D92D20', bg: '#FDECEC' },
        info: { DEFAULT: '#1655F2', bg: '#EEF3FF' },
      },
      fontFamily: {
        display: ['"TASA Orbiter"', 'Inter', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'system-ui', '-apple-system', '"Segoe UI"', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      borderRadius: { card: '12px', ctl: '8px' },
      boxShadow: {
        card: '0 1px 2px rgba(12,25,39,.06)',
        drawer: '0 12px 32px rgba(12,25,39,.18)',
        tip: '0 8px 24px rgba(12,25,39,.24)',
      },
      fontSize: {
        '2xs': ['11px', '14px'],
        xs: ['12px', '16px'],
        sm: ['13px', '18px'],
        kpi: ['28px', '32px'],
        title: ['22px', '28px'],
      },
    },
  },
  plugins: [],
}
