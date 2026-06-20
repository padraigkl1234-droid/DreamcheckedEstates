import type {Config} from 'tailwindcss';

export default {
  darkMode: ['class'],
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        body: ['Poppins', 'sans-serif'],
        headline: ['Poppins', 'sans-serif'],
        code: ['monospace'],
        sans: [
          'var(--font-inter)',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'sans-serif',
        ],
        mono: [
          '"JetBrains Mono"',
          'ui-monospace',
          'SFMono-Regular',
          '"SF Mono"',
          '"Cascadia Mono"',
          '"Roboto Mono"',
          'Consolas',
          '"Liberation Mono"',
          'monospace',
        ],
      },
      boxShadow: {
        'glow-none': 'none',
        'glow-subtle': '0 0 6px 0 rgba(0, 240, 255, 0.12), inset 0 0 8px 0 rgba(0, 240, 255, 0.06)',
        'glow-strong': '0 0 22px 2px rgba(0, 240, 255, 0.55), inset 0 0 14px 0 rgba(0, 240, 255, 0.15)',
        'glow-strong-amber': '0 0 22px 2px rgba(251, 191, 36, 0.5), inset 0 0 14px 0 rgba(251, 191, 36, 0.12)',
        'glow-strong-red': '0 0 22px 2px rgba(248, 113, 113, 0.55), inset 0 0 14px 0 rgba(248, 113, 113, 0.15)',
        'glow-strong-blue': '0 0 22px 2px rgba(0, 102, 255, 0.5), inset 0 0 14px 0 rgba(0, 102, 255, 0.15)',
      },
      dropShadow: {
        'glow-none': 'none',
        'glow-subtle': '0 0 3px rgba(0, 240, 255, 0.25)',
        'glow-strong': '0 0 10px rgba(0, 240, 255, 0.85)',
        'glow-strong-amber': '0 0 10px rgba(251, 191, 36, 0.8)',
        'glow-strong-red': '0 0 10px rgba(248, 113, 113, 0.8)',
      },
      colors: {
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        chart: {
          '1': 'hsl(var(--chart-1))',
          '2': 'hsl(var(--chart-2))',
          '3': 'hsl(var(--chart-3))',
          '4': 'hsl(var(--chart-4))',
          '5': 'hsl(var(--chart-5))',
        },
        sidebar: {
          DEFAULT: 'hsl(var(--sidebar-background))',
          foreground: 'hsl(var(--sidebar-foreground))',
          primary: 'hsl(var(--sidebar-primary))',
          'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
          accent: 'hsl(var(--sidebar-accent))',
          'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
          border: 'hsl(var(--sidebar-border))',
          ring: 'hsl(var(--sidebar-ring))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      keyframes: {
        'accordion-down': {
          from: {
            height: '0',
          },
          to: {
            height: 'var(--radix-accordion-content-height)',
          },
        },
        'accordion-up': {
          from: {
            height: 'var(--radix-accordion-content-height)',
          },
          to: {
            height: '0',
          },
        },
        marquee: {
          '0%': { transform: 'translateX(0%)' },
          '100%': { transform: 'translateX(-50%)' },
        },
        'jarvis-scan': {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100%)' },
        },
        scanlines: {
          '0%': { backgroundPosition: '0 0' },
          '100%': { backgroundPosition: '0 8px' },
        },
        waveform: {
          '0%, 100%': { transform: 'scaleY(0.25)' },
          '50%': { transform: 'scaleY(1)' },
        },
        'float-sparkle': {
          '0%': { transform: 'translateY(0) scale(0.6)', opacity: '0' },
          '30%': { opacity: '1' },
          '100%': { transform: 'translateY(-26px) scale(1)', opacity: '0' },
        },
        'cloud-drift': {
          '0%, 100%': { transform: 'translateX(-10px)' },
          '50%': { transform: 'translateX(10px)' },
        },
        'rain-fall': {
          '0%': { transform: 'translateY(0)', opacity: '0.9' },
          '100%': { transform: 'translateY(36px)', opacity: '0' },
        },
        'snow-fall': {
          '0%': { transform: 'translate(0, 0)', opacity: '0.9' },
          '100%': { transform: 'translate(10px, 46px)', opacity: '0' },
        },
        'bolt-flash': {
          '0%, 100%': { opacity: '0.25' },
          '45%': { opacity: '0.25' },
          '50%': { opacity: '1' },
          '55%': { opacity: '0.25' },
          '75%': { opacity: '0.85' },
          '80%': { opacity: '0.25' },
        },
        'fog-drift': {
          '0%, 100%': { transform: 'translateX(-12px)', opacity: '0.5' },
          '50%': { transform: 'translateX(12px)', opacity: '0.85' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        marquee: 'marquee 28s linear infinite',
        'jarvis-scan': 'jarvis-scan 3s ease-in-out infinite',
        scanlines: 'scanlines 9s linear infinite',
        waveform: 'waveform 1s ease-in-out infinite',
        'float-sparkle': 'float-sparkle 3s ease-in-out infinite',
        'cloud-drift': 'cloud-drift 9s ease-in-out infinite',
        'rain-fall': 'rain-fall 0.9s linear infinite',
        'snow-fall': 'snow-fall 4s linear infinite',
        'bolt-flash': 'bolt-flash 3.2s ease-in-out infinite',
        'fog-drift': 'fog-drift 10s ease-in-out infinite',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
} satisfies Config;
