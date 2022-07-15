const { nodeFileTrace } = require("@vercel/nft");
const files = ["./src/main.js", "./src/second.js"];
const { fileList } = await nodeFileTrace(files);
