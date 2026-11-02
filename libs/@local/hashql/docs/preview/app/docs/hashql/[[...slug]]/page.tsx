import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
} from "@fumadocs/base-ui/layouts/docs/page";
import defaultMdxComponents from "@fumadocs/base-ui/mdx";
import { notFound } from "next/navigation.js";

import { Body } from "../../../../../lib/components.js";
import { components } from "../../../../components/api.js";
import { source } from "../../../../lib/source.js";

import type { Metadata } from "next";
import type { ReactNode } from "react";

interface Props {
  params: Promise<{ slug?: string[] }>;
}

export default async function Page({ params }: Props): Promise<ReactNode> {
  const { slug } = await params;
  const page = source.getPage(slug);
  if (page === undefined) {
    notFound();
  }

  const { data } = page;

  return (
    <DocsPage toc={data.toc}>
      <DocsTitle>{data.title}</DocsTitle>
      <DocsDescription>{data.description}</DocsDescription>
      <DocsBody>
        {"hast" in data ? (
          <Body
            tree={data.hast}
            components={components}
            html={defaultMdxComponents}
            // oxlint-disable-next-line react-perf/jsx-no-new-function-as-prop -- rendered once, on the server
            resolve={(href) => source.resolveHref(href, page)}
          />
        ) : (
          <data.body components={defaultMdxComponents} />
        )}
      </DocsBody>
    </DocsPage>
  );
}

export function generateStaticParams(): { slug: string[] }[] {
  return source.generateParams();
}

// The build prerenders every page, and any other path is a 404.
export const dynamicParams = false;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const page = source.getPage(slug);
  if (page === undefined) {
    notFound();
  }

  return { title: page.data.title, description: page.data.description };
}
