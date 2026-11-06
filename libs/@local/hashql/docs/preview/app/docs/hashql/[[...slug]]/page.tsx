import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
} from "@fumadocs/base-ui/layouts/docs/page";
import defaultMdxComponents from "@fumadocs/base-ui/mdx";
import { notFound } from "next/navigation.js";

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

  const Body = page.data.body;

  return (
    <DocsPage toc={page.data.toc}>
      <DocsTitle>{page.data.title}</DocsTitle>
      <DocsDescription>{page.data.description}</DocsDescription>
      <DocsBody>
        <Body components={defaultMdxComponents} />
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
