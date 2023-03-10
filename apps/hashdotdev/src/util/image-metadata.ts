/* eslint-disable @typescript-eslint/no-unnecessary-condition */

import { getPlaiceholder } from "plaiceholder";
import type { Node } from "unist";
import { visit } from "unist-util-visit";

// The ImageNode type, because we're using TypeScript
type ImageNode = {
  type: "mdxJsxFlowElement";
  name: "img";
  attributes: {
    type: "mdxJsxAttribute";
    name: "src" | "blurDataURL";
    value: string;
  }[];
};

// Just to check if the node is an image node
const isImageNode = (node: Node): node is ImageNode => {
  const img = node as ImageNode;
  const src = img.attributes.find((attr) => attr.name === "src")?.value;

  return (
    img.type === "mdxJsxFlowElement" &&
    img.name === "img" &&
    typeof src === "string"
  );
};

const addBlurDataURL = async (node: ImageNode) => {
  const src = node.attributes.find((a) => a.name === "src")?.value;

  if (!src) {
    throw new Error("Cannot found src in image node");
  }

  const blur64 = (await getPlaiceholder(src)).base64;

  node.attributes.push({
    type: "mdxJsxAttribute",
    name: "blurDataURL",
    value: blur64,
  });
};

export const imageMetadata = () => {
  return async function transformer(tree: Node): Promise<Node> {
    // Create an array to hold all of the images from the markdown file
    const images: ImageNode[] = [];

    visit(tree, "mdxJsxFlowElement", (node) => {
      // Visit every jsx flow element node in the tree, check if it's an image and push it in the images array
      if (isImageNode(node)) {
        images.push(node);
      }
    });

    for (const image of images) {
      await addBlurDataURL(image);
    }

    return tree;
  };
};
