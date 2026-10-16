import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
} from "fumadocs-ui/layouts/docs/page";
import { createRelativeLink } from "fumadocs-ui/mdx";
import { notFound } from "next/navigation";

import { getMDXComponents } from "../../../components/mdx";
import { source } from "../../../lib/source";

import type { Metadata } from "next";
import type { ReactNode } from "react";

interface PageProps {
  params: Promise<{ slug?: string[] }>;
}

export default async function Page({ params }: PageProps): Promise<ReactNode> {
  const { slug } = await params;
  const page = source.getPage(slug);
  if (page === undefined) {
    notFound();
  }
  const Content = page.data.body;
  const components = getMDXComponents({
    // oxlint-disable-next-line id-length -- MDX uses HTML tag names as component keys.
    a: createRelativeLink(source, page),
  });
  return (
    <DocsPage toc={page.data.toc} full={page.data.full}>
      <DocsTitle>{page.data.title}</DocsTitle>
      <DocsDescription>{page.data.description}</DocsDescription>
      {/* Qualified type names may be longer than the mobile viewport. */}
      {/* oxlint-disable-next-line react/forbid-component-props -- DocsBody exposes className for content layout. */}
      <DocsBody className="[&_h2]:wrap-anywhere">
        <Content components={components} />
      </DocsBody>
    </DocsPage>
  );
}

export const generateStaticParams = (): { slug: string[] }[] =>
  source.generateParams();

export const generateMetadata = async ({
  params,
}: PageProps): Promise<Metadata> => {
  const { slug } = await params;
  const page = source.getPage(slug);
  if (page === undefined) {
    notFound();
  }
  return { title: page.data.title, description: page.data.description };
};
