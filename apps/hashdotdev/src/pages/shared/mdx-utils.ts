import path from "node:path";

import fs from "fs-extra";
import matter from "gray-matter";
import { htmlToText } from "html-to-text";
import { MDXRemoteSerializeResult } from "next-mdx-remote";
import { serialize } from "next-mdx-remote/serialize";
import remarkGfm from "remark-gfm";
import remarkMdx from "remark-mdx";
import remarkMdxDisableExplicitJsx from "remark-mdx-disable-explicit-jsx";
import remarkParse from "remark-parse";
import slugify from "slugify";
import { unified } from "unified";

import { SiteMapPage, SiteMapPageSection } from "./sitemap";

type Node = {
  type: string;
  name?: string;
};

type TextNode = {
  value: string | TextNode;
} & Node;

const isTextNode = (node: Node | string): node is TextNode =>
  typeof node !== "string" && "value" in node;

type Parent = {
  children: (TextNode | Node)[];
} & Node;

const isParent = (node: Node): node is Parent => "children" in node;

type Heading = {
  type: "heading";
  depth: number;
} & Parent;

const isHeading = (node: Node): node is Heading => node.type === "heading";

type FAQ = {
  type: "mdxJsxFlowElement";
  name: "FAQ";
  attributes: {
    type: "mdxJsxAttribute";
    name: string;
    value: string;
  }[];
} & Parent;

const isFAQ = (node: Node): node is FAQ =>
  node.type === "mdxJsxFlowElement" && node.name === "FAQ";

type ParsedAST = {
  type: "root";
} & Parent;

// Parses the abstract syntax tree of a stringified MDX file
const parseAST = (mdxFileContent: string) =>
  unified().use(remarkParse).use(remarkMdx).parse(mdxFileContent) as ParsedAST;

// Recursively returns all the headings in an MDX AST
const getHeadingsFromParent = (parent: Parent): Heading[] =>
  parent.children
    .map((child) => {
      const subHeadings = isParent(child) ? getHeadingsFromParent(child) : [];
      if (isHeading(child)) {
        return [child];
      } else if (isFAQ(child)) {
        const heading: Heading = {
          type: "heading",
          /** @todo: don't assume that FAQ accordions are always headings at depth 3 */
          depth: 3,
          children: [
            {
              type: "text",
              value:
                child.attributes.find(({ name }) => name === "question")
                  ?.value ?? "Unknown",
            },
          ],
        };
        return [heading, ...subHeadings];
      }
      return subHeadings;
    })
    .flat();

// Parses the name from a MDX file name (removing the prefix index and the .mdx file extension)
const parseNameFromFileName = (fileName: string): string => {
  const matches = fileName.match(/^\d+[_-](.*?)\.(mdx|md)$/);

  if (!matches || matches.length < 2) {
    throw new Error(`Invalid MDX fileName: ${fileName}`);
  }

  return matches[1]!;
};

// Gets all hrefs corresponding to the MDX files in a directory
export const getAllDocsPageHrefs = (params: {
  folderName: string;
}): string[] => {
  const { folderName } = params;

  const fileNames = fs.readdirSync(
    path.join(process.cwd(), `src/_pages/${folderName}`),
  );

  return fileNames.map((fileName) => {
    const name = parseNameFromFileName(fileName);

    return `/${folderName}${name === "index" ? "" : `/${name}`}`;
  });
};

export type DocsPageData = {
  title: string;
  subtitle?: string;
};

// Serializes an MDX file
export const getSerializedDocsPage = async (params: {
  pathToDirectory: string;
  parts: string[];
}): Promise<MDXRemoteSerializeResult<DocsPageData>> => {
  const { pathToDirectory, parts } = params;

  let mdxPath = path.join(process.cwd(), `src/_pages/${pathToDirectory}`);

  for (const part of parts) {
    const fileNames = await fs.readdir(mdxPath);

    const nextFileNamePart = fileNames.find(
      (fileName) =>
        fileName.endsWith(part) ||
        fileName.endsWith(`${part}.mdx`) ||
        fileName.endsWith(`${part}.md`),
    )!;
    mdxPath = path.join(mdxPath, nextFileNamePart);
  }

  if ((await fs.lstat(mdxPath)).isDirectory()) {
    mdxPath = path.join(mdxPath, "00_index.mdx");
  }

  const source = await fs.readFile(mdxPath);
  const { content, data } = matter(source);

  const serializedMdx = (await serialize(content, {
    // Optionally pass remark/rehype plugins
    mdxOptions: {
      remarkPlugins: [remarkMdxDisableExplicitJsx, remarkGfm],
      rehypePlugins: [],
    },
    scope: data,
  })) as MDXRemoteSerializeResult<DocsPageData>;

  return serializedMdx;
};

// Recursively construct the text from leaf text nodes in an MDX AST
const getFullText = (node: Node): string =>
  [
    isTextNode(node)
      ? isTextNode(node.value)
        ? htmlToText(node.value.value as string)
        : node.value
      : "",
    ...(isParent(node) ? node.children.map(getFullText) : []),
  ].join("");

// Recursively construct the text from leaf text nodes in an MDX AST
const getVisibleText = (node: Node): string =>
  [
    isTextNode(node)
      ? isTextNode(node.value)
        ? node.value.value
        : node.value
      : "",
    ...(isParent(node) &&
    (node.type !== "mdxJsxTextElement" || node.name !== "Hidden")
      ? node.children.map(getVisibleText)
      : []),
  ].join("");

const getHeadingsFromMarkdown = (markdownFilePath: string): Heading[] => {
  const source = fs.readFileSync(path.join(process.cwd(), markdownFilePath));

  const { content, data } = matter(source);

  const ast = parseAST(content);

  const headings = getHeadingsFromParent(ast);

  return [
    {
      type: "heading" as const,
      depth: 1,
      children: [
        {
          type: "text",
          value: data.title ?? "Unknown",
        },
      ],
    },
    ...(data.subtitle
      ? [
          {
            type: "heading" as const,
            depth: 2,
            children: [
              {
                type: "text",
                value: data.subtitle,
              },
            ],
          },
        ]
      : []),
    ...headings,
  ];
};

// Get the structure of a given MDX file in a given directory
export const getDocsPage = (params: {
  pathToDirectory: string;
  fileName: string;
  isRfc?: boolean;
}): Omit<SiteMapPage, "subPages"> => {
  const { pathToDirectory, fileName, isRfc = false } = params;

  const markdownFilePath = isRfc
    ? `../../rfcs/text/${fileName}`
    : `src/_pages/${pathToDirectory}/${fileName}`;

  let headings: Heading[];

  try {
    headings = getHeadingsFromMarkdown(markdownFilePath);
  } catch (error: unknown) {
    // eslint-disable-next-line no-console
    console.error(
      `Error parsing headings from the MDX file at path: ${markdownFilePath}`,
    );
    throw error;
  }

  const h1 = headings.find(({ depth }) => depth === 1);

  const title = h1 ? getVisibleText(h1) : "Unknown";

  let name: string;

  try {
    name = parseNameFromFileName(fileName);
  } catch (error: unknown) {
    // eslint-disable-next-line no-console
    console.error(
      `Error parsing the name of the MDX file at path: ${markdownFilePath}`,
    );
    throw error;
  }

  return {
    title,
    href: `/${pathToDirectory.replace(/\d+_/g, "")}${
      name === "index" ? "" : `/${slugify(name, { lower: true })}`
    }`,
    markdownFilePath,
    sections: headings
      .reduce<SiteMapPageSection[]>((prev, currentHeading) => {
        const slug = slugify(getFullText(currentHeading), {
          lower: true,
        });

        const newSection = {
          title: getVisibleText(currentHeading),
          anchor: slug,
          subSections: [],
        };

        if (currentHeading.depth === 2) {
          return [...prev, newSection];
        } else if (currentHeading.depth === 3) {
          return prev.length > 0
            ? [
                ...prev.slice(0, -1),
                {
                  ...prev[prev.length - 1]!,
                  subSections: [
                    ...(prev[prev.length - 1]?.subSections ?? []),
                    newSection,
                  ],
                },
              ]
            : prev;
        }

        return prev;
      }, [])
      .filter((heading) => heading.anchor !== "proposed-changes"),
  };
};

export const recursivelyGetDocsPages = (params: {
  pathToDirectory: string;
}): SiteMapPage[] => {
  const { pathToDirectory } = params;

  const directoryItems = fs
    .readdirSync(path.join(process.cwd(), `src/_pages/${pathToDirectory}`))
    .filter((item) => item !== "00_index.mdx");

  return directoryItems.flatMap((directoryItem) => {
    const isDirectory = fs
      .lstatSync(`src/_pages/${pathToDirectory}/${directoryItem}`)
      .isDirectory();

    if (isDirectory) {
      const hasIndexPage = fs.existsSync(
        `src/_pages/${pathToDirectory}/${directoryItem}/00_index.mdx`,
      );

      const indexPage = hasIndexPage
        ? getDocsPage({
            pathToDirectory: `${pathToDirectory}/${directoryItem}`,
            fileName: "00_index.mdx",
          })
        : undefined;

      if (indexPage) {
        return {
          ...indexPage,
          subPages: recursivelyGetDocsPages({
            pathToDirectory: `${pathToDirectory}/${directoryItem}`,
          }),
        };
      }

      const directoryNameWithoutIndex = directoryItem.split("_")[1] ?? "";

      const title = directoryNameWithoutIndex
        .split("-")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ");

      return {
        title,
        href: `/${pathToDirectory.replace(/\d+_/g, "")}/${directoryNameWithoutIndex}`,
        sections: [],
        subPages: recursivelyGetDocsPages({
          pathToDirectory: `${pathToDirectory}/${directoryItem}`,
        }),
      };
    } else if (directoryItem.endsWith(".mdx")) {
      return {
        ...getDocsPage({
          pathToDirectory,
          fileName: directoryItem,
        }),
        subPages: [],
      };
    }

    return [];
  });
};
