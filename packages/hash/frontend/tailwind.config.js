module.exports = {
  purge: [
    "./src/pages/**/*.{js,ts,jsx,tsx}",
    "./src/components/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: false, // or 'media' or 'class'
  theme: {
    colors: {
      gray: {
        50: "#FBFBFB",
        100: "#F1F1F1",
      },
    },
    extend: {},
  },
  variants: {
    extend: {},
  },
  plugins: [],
  corePlugins: {
    // https://tailwindcss.com/docs/preflight - to sift through later
    preflight: false,
  },
};
