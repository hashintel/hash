export default {
  entry: "./src/index.js",
  output: {
    filename: "apache-arrow-bundle.js",
  },
  mode: "production",
  optimization: {
    usedExports: false,
  },
};
