import { lazy, Suspense, type FunctionComponent } from "react";

import { css } from "@hashintel/ds-helpers/css";

import { previewSearchToNavigationState } from "./navigation-search";

import type { GeneratedExampleRuntime, LoadedExample } from "./catalog";
import type { SharedExampleSearch } from "./example-search";
import type {
  PetrinautPreviewNavigationState,
  PetrinautPreviewQuickSimulation,
} from "@hashintel/petrinaut/preview";
import type { PetrinautNavigationController } from "@hashintel/petrinaut/react";

const LazyPetrinautPreview = lazy(async () => {
  const { PetrinautPreview } = await import("@hashintel/petrinaut/preview");
  return { default: PetrinautPreview };
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

export type EmbeddedExamplePageProps = {
  example: LoadedExample;
  runtime: GeneratedExampleRuntime;
  onNavigate: PetrinautNavigationController<PetrinautPreviewNavigationState>["onNavigate"];
  search: SharedExampleSearch;
};

export const EmbeddedExamplePage: FunctionComponent<
  EmbeddedExamplePageProps
> = ({ example, onNavigate, runtime, search }) => {
  const navigation: PetrinautNavigationController<PetrinautPreviewNavigationState> =
    {
      state: previewSearchToNavigationState(search),
      historyPolicy: () => "replace",
      onNavigate,
    };
  const quickSimulation: PetrinautPreviewQuickSimulation = {
    ...runtime,
    parameterBounds: example.catalog.parameterBounds,
  };

  return (
    <main className={pageStyle}>
      <Suspense
        fallback={<div className={loadingStyle}>Loading Petrinaut…</div>}
      >
        <LazyPetrinautPreview
          definition={example.definition}
          documentId={`example:${example.catalog.slug}`}
          navigation={navigation}
          quickSimulation={quickSimulation}
          title={example.catalog.title}
        />
      </Suspense>
    </main>
  );
};
