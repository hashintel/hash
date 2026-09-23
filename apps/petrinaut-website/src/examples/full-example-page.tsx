import { useEffect } from "react";

import { css } from "@hashintel/ds-helpers/css";
import { Petrinaut, PetrinautPluginsProvider } from "@hashintel/petrinaut/ui";

import { exampleTitlePlugin } from "./example-title-plugin";
import { getOEmbedDiscoveryUrl } from "./oembed-discovery";
import { getReadonlyExampleHandle } from "./readonly-example-handle";
import { useSharedSearchNavigation } from "./use-shared-search-navigation";

import type { LoadedExample } from "./catalog";
import type { SharedExampleSearch } from "./example-search";

const pageStyle = css({
  width: "[100vw]",
  height: "[100vh]",
  minWidth: "0",
  minHeight: "0",
  overflow: "hidden",
});

const examplePlugins = [exampleTitlePlugin];

export type FullExamplePageProps = {
  example: LoadedExample;
  /** Writes the shared search subset back to the page URL. */
  onSearchChange: (
    search: SharedExampleSearch,
    history: "push" | "replace",
  ) => void;
  search: SharedExampleSearch;
};

export const FullExamplePage = ({
  example,
  onSearchChange,
  search,
}: FullExamplePageProps) => {
  const handle = getReadonlyExampleHandle(example);
  const navigation = useSharedSearchNavigation(search, onSearchChange);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = `${example.catalog.title} · Petrinaut`;
    return () => {
      document.title = previousTitle;
    };
  }, [example.catalog.title]);

  // The website is a client-rendered SPA, so the oEmbed discovery link cannot
  // be baked into index.html; React 19 hoists this <link> into document.head.
  // Consumers that execute the page's JavaScript can then discover the same
  // production oEmbed endpoint used by server integrations.
  const discoveryUrl = getOEmbedDiscoveryUrl(example.catalog.slug, search);

  return (
    <main className={pageStyle}>
      <link
        href={discoveryUrl}
        rel="alternate"
        title={`${example.catalog.title} oEmbed profile`}
        type="application/json+oembed"
      />
      <PetrinautPluginsProvider plugins={examplePlugins}>
        <Petrinaut
          handle={handle}
          hideNetManagementControls="all"
          navigation={navigation}
          presentationProfile="review"
          readonly
          title={example.catalog.title}
        />
      </PetrinautPluginsProvider>
    </main>
  );
};
