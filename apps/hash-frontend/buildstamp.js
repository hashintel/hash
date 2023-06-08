const branch = process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_REF ?? "local-dev";
const identifier =
  process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ?? new Date().toISOString();
const buildStamp = `commit-${identifier}-${branch.replace(/\//g, "-")}`;

module.exports = { buildStamp };
