import oEmbedData from "oembed-providers/providers.json";
import sanitizeHtml from "sanitize-html";

import type {
  Embed,
  Maybe,
  QueryEmbedCodeArgs,
  ResolverFn,
} from "../../api-types.gen";
import type { GraphQLContext } from "../../context";
import * as Error from "../../error";

/**
 * Sanitize oEmbed HTML to prevent XSS from third-party providers.
 *
 * Allows structural elements needed for embeds (iframes, blockquotes, images)
 * while stripping scripts and event handlers. Script-dependent embeds (e.g.
 * Twitter) will degrade to showing their static HTML content.
 */
const sanitizeOembedHtml = (html: string): string =>
  sanitizeHtml(html, {
    allowedTags: [
      "iframe",
      "blockquote",
      "a",
      "img",
      "div",
      "span",
      "p",
      "br",
      "em",
      "strong",
      "figure",
      "figcaption",
      "cite",
      "time",
    ],
    allowedAttributes: {
      iframe: [
        "src",
        "width",
        "height",
        "frameborder",
        "allowfullscreen",
        "allow",
        "title",
        "style",
        "loading",
        "referrerpolicy",
      ],
      blockquote: ["class", "data-*", "cite", "style"],
      a: ["href", "title", "class", "target", "rel"],
      img: ["src", "alt", "width", "height", "class", "style", "loading"],
      div: ["class", "style"],
      span: ["class", "style"],
      p: ["class", "style"],
      time: ["datetime"],
    },
    allowedSchemes: ["https"],
  });

oEmbedData.unshift({
  provider_name: "HASH",
  provider_url: "https://hash.ai",
  endpoints: [
    {
      schemes: ["https://core.hash.ai/@*"],
      url: "https://api.hash.ai/oembed",
      discovery: false,
    },
  ],
});

interface Endpoint {
  schemes?: string[];
  url: string;
  discovery: boolean;
  formats: string[];
}

interface IoEmbedData {
  provider_name: string;
  provider_url: string;
  endpoints: Endpoint[];
}

type OembedResponse = {
  title: string;
  author_name: string;
  author_url: string;
  type: string;
  height: number;
  width: number;
  version: string;
  provider_name: string;
  provider_url: string;
  thumbnail_height: number;
  thumbnail_width: number;
  thumbnail_url: string;
  html: string;
};

const getOembedEndpoint = (url: string, type?: string) => {
  for (const { provider_name, endpoints } of oEmbedData as IoEmbedData[]) {
    if (type && provider_name !== type) {
      continue;
    }
    for (const endpoint of endpoints) {
      const isMatch = !!endpoint.schemes?.find((scheme) =>
        scheme.split("*").every((substring) => url.includes(substring)),
      );

      if (isMatch) {
        return endpoint.url;
      }
    }
  }
};

async function getEmbedResponse({
  url,
  type,
}: {
  url: string;
  type?: Maybe<string>;
}) {
  const oembedEndpoint = getOembedEndpoint(url, type || undefined);

  if (!oembedEndpoint) {
    return {
      error: true,
    };
  }

  return await fetch(
    `${oembedEndpoint}?url=${encodeURIComponent(url)}&maxwidth=1000`,
  ).then((response) => response.json());
}

export const embedCode: ResolverFn<
  Promise<Embed>,
  Record<string, never>,
  GraphQLContext,
  QueryEmbedCodeArgs
> = async (_, { url, type }) => {
  const embedResponse = (await getEmbedResponse({
    url,
    type,
  }).catch((__) => {
    throw Error.notFound(
      `Embed Code for URL ${url} not found${
        type?.trim() ? ` for type ${type}` : ""
      }`,
    );
  })) as OembedResponse & { error: boolean };

  const { html, error, provider_name, height, width } = embedResponse;

  if (error) {
    throw Error.notFound(
      `Embed Code for URL ${url} not found${
        type?.trim() ? ` for type ${type}` : ""
      }`,
    );
  }

  return {
    html: html ? sanitizeOembedHtml(html) : html,
    providerName: provider_name,
    height,
    width,
  };
};
