/** @type {import('tailwindcss').Config} */
function brandScale() {
  const out = {};
  for (const k of [50, 100, 200, 300, 400, 500, 600, 700, 800, 900]) {
    out[k] = `rgb(var(--brand-${k}) / <alpha-value>)`;
  }
  return out;
}

export default {
  content: ["./index.html", "./src/**/*.{vue,js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: brandScale(),
        accent: {
          50: "#fffbeb",
          100: "#fef3c7",
          200: "#fde68a",
          400: "#fbbf24",
          500: "#f59e0b",
          600: "#d97706",
        },
      },
      boxShadow: {
        card: "0 1px 2px 0 rgba(15, 23, 42, 0.04), 0 1px 3px 0 rgba(15, 23, 42, 0.06)",
      },
    },
  },
  plugins: [],
};
