import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        ink: '#172521',
        forest: '#173a32',
        leaf: '#d4ef6b',
        canvas: '#f3f5f1',
        muted: '#71807a',
        line: '#e4e9e3',
        coral: '#dc7058',
      },
      boxShadow: {
        panel: '0 12px 36px rgba(23, 37, 33, 0.045)',
      },
    },
  },
  plugins: [],
};

export default config;