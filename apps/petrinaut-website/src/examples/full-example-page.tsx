import { getOEmbedDiscoveryUrl } from "./oembed-discovery";
import {
  ReadonlyDocumentPage,
  type ReadonlyDocumentPageProps,
} from "./readonly-document-page";
import { getReadonlyExampleHandle } from "./readonly-example-handle";

import type { LoadedExample } from "./catalog";

export type FullExamplePageProps = Omit<
  ReadonlyDocumentPageProps,
  "handle" | "title"
> & { example: LoadedExample };

export const FullExamplePage = ({
  example,
  ...props
}: FullExamplePageProps) => (
  <>
    {/* The website is a client-rendered SPA, so the oEmbed discovery link
        cannot be baked into index.html; React 19 hoists this <link> into
        document.head. Consumers that execute the page's JavaScript can then
        discover the same production oEmbed endpoint used by server
        integrations. */}
    <link
      href={getOEmbedDiscoveryUrl(example.catalog.slug, props.search)}
      rel="alternate"
      title={`${example.catalog.title} oEmbed profile`}
      type="application/json+oembed"
    />
    <ReadonlyDocumentPage
      {...props}
      handle={getReadonlyExampleHandle(example)}
      title={example.catalog.title}
    />
  </>
);
