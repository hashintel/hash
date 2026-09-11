import { useEffect, useState } from "react";

import { Button } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";
import { Petrinaut } from "@hashintel/petrinaut/ui";

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

const titleStyle = css({
  minWidth: "0",
  overflow: "hidden",
  color: "neutral.s90",
  fontSize: "sm",
  fontWeight: "medium",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

export type FullExamplePageProps = {
  example: LoadedExample;
  onFork: () => void;
  /** Writes the shared search subset back to the page URL. */
  onSearchChange: (
    search: SharedExampleSearch,
    history: "push" | "replace",
  ) => void;
  search: SharedExampleSearch;
};

export const FullExamplePage = ({
  example,
  onFork,
  onSearchChange,
  search,
}: FullExamplePageProps) => {
  const [forkError, setForkError] = useState<string | null>(null);
  const handle = getReadonlyExampleHandle(example);
  const navigation = useSharedSearchNavigation(search, onSearchChange);

  const forkLocalCopy = () => {
    try {
      onFork();
      setForkError(null);
    } catch {
      setForkError(
        "Your browser couldn't save a copy. Free up browser storage and try again.",
      );
    }
  };

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
      {forkError && (
        <div
          role="alert"
          className={css({
            position: "absolute",
            top: "16",
            right: "4",
            zIndex: "[50]",
            background: "neutral.s00",
            borderRadius: "md",
            padding: "3",
            boxShadow: "md",
            maxWidth: "[360px]",
            fontSize: "sm",
          })}
        >
          {forkError}
        </div>
      )}
      <Petrinaut
        handle={handle}
        hideNetManagementControls="all"
        navigation={navigation}
        presentationProfile="review"
        readonly
        readOnlyAction={{ label: "Make a local copy", onClick: forkLocalCopy }}
        slots={{
          topBarEnd: (
            <Button size="xs" variant="subtle" onClick={forkLocalCopy}>
              Make a local copy
            </Button>
          ),
          topBarStart: (
            <span className={titleStyle}>{example.catalog.title}</span>
          ),
        }}
        title={example.catalog.title}
      />
    </main>
  );
};
