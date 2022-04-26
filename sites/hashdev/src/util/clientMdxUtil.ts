// Parses the name from a MDX file name (removing the prefix index and the .mdx
// file extension)
export const parseNameFromFileName = (fileName: string): string => {
  const matches = fileName.match(/^\d+_(.*?)\.mdx$/);

  if (!matches || matches.length < 2) {
    throw new Error(`Invalid MDX fileName: ${fileName}`);
  }

  return matches[1]!;
};
