import {
  ReadonlyDocumentPage,
  type ReadonlyDocumentPageProps,
} from "../main/app/readonly-document-page";
import { getOEmbedDiscoveryUrl } from "./oembed-discovery";
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
