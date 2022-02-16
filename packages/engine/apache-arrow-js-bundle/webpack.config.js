import webpack from "webpack";
export default {
  entry: "./src/index.js",
  output: {
    filename: "apache-arrow-bundle.js",
  },
  mode: "production",
  node: {
    global: true,
  },
  optimization: {
    // We don't want deadcode elimination to remove arrow
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
