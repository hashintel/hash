import webpack from "webpack";

export default {
  entry: "./src/index.mjs",
  output: {
    filename: "apache-arrow-bundle.js",
    library: {
      name: "arrow",
      type: "var",
    },
  },
  mode: "production",
  node: {
    global: true,
  },
  optimization: {
    // We don't want dead-code elimination to remove arrow
    usedExports: false,
    // Minimizing makes runner errors really hard to read
    minimize: false,
  },
  plugins: [
    new webpack.ProvidePlugin({
      TextEncoder: ["@zxing/text-encoding", "TextEncoder"],
      TextDecoder: ["@zxing/text-encoding", "TextDecoder"],
    }),
  ],
};
