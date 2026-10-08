/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        admin: {
          primary: {
            DEFAULT: 'var(--admin-primary)',
            hover: 'var(--admin-primary-hover)',
            bg: 'var(--admin-primary-bg)',
          },
          secondary: {
            DEFAULT: 'var(--admin-secondary)',
            dark: 'var(--admin-secondary-dark)',
          },
          accent: {
            DEFAULT: 'var(--admin-accent)',
            hover: 'var(--admin-accent-hover)',
          },
          bg: {
            app: 'var(--admin-bg-app)',
            surface: 'var(--admin-bg-surface)',
            muted: 'var(--admin-bg-muted)',
          },
          border: {
            subtle: 'var(--admin-border-subtle)',
            DEFAULT: 'var(--admin-border-default)',
          },
          text: {
            primary: 'var(--admin-text-primary)',
            secondary: 'var(--admin-text-secondary)',
          },
          status: {
            success: 'var(--admin-success)',
            warning: 'var(--admin-warning)',
            danger: 'var(--admin-danger)',
            info: 'var(--admin-info)',
          }
        }
      }
    },
  },
  plugins: [],
};
