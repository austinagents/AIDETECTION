import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#0F1115",
          900: "#13161C",
          850: "#171A21",
          800: "#1C2028",
          700: "#242834"
        },
        risk: {
          low: "#3A7D44",
          medium: "#B8860B",
          high: "#A63D40"
        }
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "Inter", "ui-sans-serif", "system-ui"]
      },
      boxShadow: {
        soft: "0 16px 40px rgba(0, 0, 0, 0.24)"
      }
    }
  },
  plugins: []
};

export default config;
