import { lazy, Suspense, type FunctionComponent } from "react";

import { css } from "@hashintel/ds-helpers/css";

import { getReadonlyExampleHandle } from "./readonly-example-handle";
import { useSharedSearchNavigation } from "./use-shared-search-navigation";

import type { LoadedExample } from "./catalog";
import type { SharedExampleSearch } from "./example-search";

const LazyPetrinaut = lazy(async () => {
  const { Petrinaut } = await import("@hashintel/petrinaut/ui");
  return { default: Petrinaut };
});

// The page frame and the loading fallback render outside Petrinaut, and the
// design-system tokens are declared on `.petrinaut-root` (`cssVarRoot` in
// `scopedThemeConfig`), so token values do not resolve here. These use
// literals, as the site's other chrome does.
const pageStyle = css({
  width: "[100vw]",
  height: "[100vh]",
  minWidth: "0",
  minHeight: "0",
  overflow: "hidden",
  backgroundColor: "[#f6f7f8]",
});

const loadingStyle = css({
  display: "flex",
  width: "[100%]",
  height: "[100%]",
  alignItems: "center",
  justifyContent: "center",
  color: "[#4b5563]",
  fontSize: "[14px]",
});

const embedTitleStyle = css({
  minWidth: "0",
  overflow: "hidden",
  color: "neutral.s90",
  fontSize: "sm",
  fontWeight: "medium",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

export type EmbeddedExamplePageProps = {
  example: LoadedExample;
  /** Writes the shared search subset back to the embed URL. */
  onSearchChange: (
    search: SharedExampleSearch,
    history: "push" | "replace",
  ) => void;
  search: SharedExampleSearch;
};

/**
 * Embed of an example: the full Petrinaut component in its read-only
 * presentation, navigated through the shared search contract.
 */
export const EmbeddedExamplePage: FunctionComponent<
  EmbeddedExamplePageProps
> = ({ example, onSearchChange, search }) => {
  const handle = getReadonlyExampleHandle(example);
  const navigation = useSharedSearchNavigation(search, onSearchChange, {
    // The embed lives in an iframe; it must not grow the host page's history.
    historyPolicy: () => "replace",
  });

  return (
    <main className={pageStyle}>
      <Suspense
        fallback={<div className={loadingStyle}>Loading Petrinaut…</div>}
      >
        <LazyPetrinaut
          handle={handle}
          hideNetManagementControls="all"
          navigation={navigation}
          presentationProfile="review"
          readonly
          slots={{
            topBarStart: (
              <span className={embedTitleStyle}>{example.catalog.title}</span>
            ),
          }}
          title={example.catalog.title}
        />
      </Suspense>
    </main>
  );
};
