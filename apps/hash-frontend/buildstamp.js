const getBuildStamp = () => {
  const branch =
    process.env.VERCEL_GIT_COMMIT_REF ??
    process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_REF ??
    "local-dev";
  const identifier =
    process.env.VERCEL_GIT_COMMIT_SHA ??
    process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ??
    new Date().toISOString();
  return `commit-${identifier}-${branch.replace(/\//g, "-")}`;
};

const buildStamp = process.env.NEXT_PUBLIC_BUILD_STAMP ?? getBuildStamp();

export { buildStamp };
