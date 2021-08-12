import fetch from "node-fetch";
import { ApolloError } from "apollo-server-errors";

import { Embed, Maybe, QueryEmbedCodeArgs, Resolver } from "../../apiTypes.gen";

import oEmbedData from "oembed-providers/providers.json";

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

import { GraphQLContext } from "../../context";

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

async function getEmbedResponse({
  url,
  type,
}: {
  url: string;
  type?: Maybe<string>;
}) {
  let oembedEndpoint = undefined;

  if (!type) {
    (oEmbedData as IoEmbedData[]).find((oembed) => {
      oembed.endpoints.find((endpoint) =>
        endpoint.schemes?.find((scheme) => {
          if (
            scheme.split("*").every((substring) => url.search(substring) > -1)
          ) {
            oembedEndpoint = endpoint.url;
            return true;
          }

          return false;
        })
      );
    });
  } else {
    const oembed = (oEmbedData as IoEmbedData[]).find(
      (oembed) => oembed.provider_name === type
    );

    oembed?.endpoints.find((endpoint) =>
      endpoint.schemes?.find((scheme) => {
        if (
          scheme.split("*").every((substring) => url.search(substring) > -1)
        ) {
          oembedEndpoint = endpoint.url;
          return true;
        }

        return false;
      })
    );
  }

  if (!oembedEndpoint) {
    return {
      error: true,
    };
  }

  return await fetch(`${oembedEndpoint}?url=${url}&maxwidth=1000`).then(
    (response) => response.json()
  );
}

export const embedCode: Resolver<
  Promise<Embed>,
  {},
  GraphQLContext,
  QueryEmbedCodeArgs
> = async (_, { url, type }, {}, {}) => {
  const embedResponse: OembedResponse & { error: boolean } =
    await getEmbedResponse({
      url,
      type,
    }).catch((err) => {
      console.error(err);
      throw new ApolloError(
        `Embed Code for URL ${url} not found${
          type?.trim() ? ` for type ${type}` : ""
        }`,
        "NOT_FOUND"
      );
    });

  const { html, error, provider_name } = embedResponse;

  if (error) {
    throw new ApolloError(
      `Embed Code for URL ${url} not found${
        type?.trim() ? ` for type ${type}` : ""
      }`,
      "NOT_FOUND"
    );
  }

  return {
    html,
    providerName: provider_name,
  };
};
