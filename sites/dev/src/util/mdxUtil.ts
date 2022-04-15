// @todo update from block protocol
import fs from "fs-extra";
import matter from "gray-matter";
import { MDXRemoteSerializeResult } from "next-mdx-remote";
import { serialize } from "next-mdx-remote/serialize";
import path from "path";
import remarkMdx from "remark-mdx";
import remarkParse from "remark-parse";
import slugify from "slugify";
import { unified } from "unified";
import { SiteMapPage, SiteMapPageSection } from "./sitemap";

type Node = {
  type: string;
};

type TextNode = {
  value: string;
} & Node;

const isTextNode = (node: Node): node is TextNode => "value" in node;

type Parent = {
  children: Node[];
} & Node;

const isParent = (node: Node): node is Parent => "children" in node;

type Heading = {
  type: "heading";
  depth: number;
} & Parent;

type Image = {
  type: "image";
  title?: null | string;
  url: string;
  alt?: null | string;
} & Parent;

const isHeading = (node: Node): node is Heading => node.type === "heading";
const isImage = (node: Node): node is Image => node.type === "image";

type ParsedAST = {
  type: "root";
} & Parent;

// Parses the abstract syntax tree of a stringified MDX file
export const parseAST = (mdxFileContent: string) =>
  unified().use(remarkParse).use(remarkMdx).parse(mdxFileContent) as ParsedAST;

// Recursively returns all the headings in an MDX AST
const getHeadingsFromParent = (parent: Parent): Heading[] =>
  parent.children
    .map((child) => {
      if (isHeading(child)) {
        return [child];
      } else if (isParent(child)) {
        return child.children
          .filter(isParent)
          .map(getHeadingsFromParent)
          .flat();
      }
      return [];
    })
    .flat();

// Recursively returns all the headings in an MDX AST
const getImagesFromParent = (parent: Parent): Image[] =>
  parent.children
    .map((child) => {
      if (isImage(child)) {
        return [child];
      } else if (isParent(child)) {
        return child.children.filter(isParent).map(getImagesFromParent).flat();
      }
      return [];
    })
    .flat();

// Parses the name from a MDX file name (removing the prefix index and the .mdx file extension)
const parseNameFromFileName = (fileName: string): string => {
  const matches = fileName.match(/^\d+_(.*?)\.mdx$/);

  if (!matches || matches.length < 2) {
    throw new Error(`Invalid MDX fileName: ${fileName}`);
  }

  return matches[1]!;
};

// Gets all hrefs corresponding to the MDX files in a directory
export const getAllPageHrefs = (params: { folderName: string }): string[] => {
  const { folderName } = params;

  const fileNames = fs.readdirSync(
    path.join(process.cwd(), `src/_pages/${folderName}`),
  );

  return fileNames.map((fileName) => {
    const name = parseNameFromFileName(fileName);

    return `/${folderName}${name === "index" ? "" : `/${name}`}`;
  });
};

// Serializes an MDX file
export const getSerializedPage = async (params: {
  pathToDirectory: string;
  fileNameWithoutIndex: string;
}): Promise<
  [
    MDXRemoteSerializeResult<Record<string, unknown>>,
    // @todo type this as unknown
    Record<string, any>,
    // @todo consider matching size here
    Image[],
  ]
> => {
  const { pathToDirectory, fileNameWithoutIndex } = params;

  const fileNames = await fs.readdir(
    path.join(process.cwd(), `src/_pages/${pathToDirectory}`),
  );

  const fileName = fileNames.find((fullFileName) =>
    fullFileName.endsWith(`${fileNameWithoutIndex}.mdx`),
  );

  const source = await fs.readFile(
    path.join(process.cwd(), `src/_pages/${pathToDirectory}/${fileName}`),
  );

  const { content, data } = matter(source);

  const ast = parseAST(content);

  const images = getImagesFromParent(ast);

  const serializedMdx = await serialize(content, {
    // Optionally pass remark/rehype plugins
    mdxOptions: {
      remarkPlugins: [],
      rehypePlugins: [],
    },
    scope: data,
  });

  return [serializedMdx, data, images];
};

// Recursively construct the text from leaf text nodes in an MDX AST
const getText = (node: Node): string =>
  [
    isTextNode(node) ? node.value : "",
    ...(isParent(node) ? node.children.map(getText) : []),
  ].join("");

// Get the structure of a given MDX file in a given directory
export const getPage = (params: {
  pathToDirectory: string;
  fileName: string;
}): SiteMapPage => {
  const { pathToDirectory, fileName } = params;

  const source = fs.readFileSync(
    path.join(process.cwd(), `src/_pages/${pathToDirectory}/${fileName}`),
  );

  const { content } = matter(source);

  const ast = parseAST(content);

  const headings = getHeadingsFromParent(ast);

  const h1 = headings.find(({ depth }) => depth === 1);

  const title = h1 ? getText(h1) : "Unknown";

  const name = parseNameFromFileName(fileName);

  return {
    title,
    href: `/${pathToDirectory}${
      name === "index" ? "" : `/${slugify(name, { lower: true })}`
    }`,
    sections: headings.reduce<SiteMapPageSection[]>((prev, currentHeading) => {
      if (currentHeading.depth === 2) {
        const sectionTitle = getText(currentHeading);
        return [
          ...prev,
          {
            title: sectionTitle,
            anchor: slugify(sectionTitle, { lower: true }),
            subSections: [],
          },
        ];
      } else if (currentHeading.depth === 3) {
        const subSectionTitle = getText(currentHeading);

        return prev.length > 0
          ? [
              ...prev.slice(0, -1),
              {
                ...prev[prev.length - 1]!,
                subSections: [
                  ...(prev[prev.length - 1]!.subSections || []),
                  {
                    title: subSectionTitle,
                    anchor: slugify(subSectionTitle, { lower: true }),
                    subSections: [],
                  },
                ],
              },
            ]
          : prev;
      }
      return prev;
    }, []),
    subPages: [],
  };
};

// Get the structure of a all MDX files in a given directory
export const getAllPages = (params: {
  pathToDirectory: string;
}): SiteMapPage[] => {
  const { pathToDirectory } = params;

  const fileNames = fs.readdirSync(
    path.join(process.cwd(), `src/_pages/${pathToDirectory}`),
  );

  return fileNames.map((fileName) =>
    getPage({
      pathToDirectory,
      fileName,
    }),
  );
};
