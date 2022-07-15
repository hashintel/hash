(async () => {
  const { nodeFileTrace } = require("@vercel/nft");
  const files = ["./src/components/RemoteBlock/RemoteBlock.tsx"];
  const { fileList } = await nodeFileTrace(files, {
    // default
    analysis: {
      // whether to glob any analysis like __dirname + '/dir/' or require('x/' + y)
      // that might output any file in a directory
      emitGlobs: true,
      // whether __filename and __dirname style
      // expressions should be analyzed as file references
      computeFileReferences: true,
      // evaluate known bindings to assist with glob and file reference analysis
      evaluatePureExpressions: true,
    },
  });
  console.log({ fileList });
})();
