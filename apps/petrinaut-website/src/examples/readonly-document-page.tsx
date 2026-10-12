import { useEffect } from "react";

import { css } from "@hashintel/ds-helpers/css";
import { Petrinaut, type PetrinautPlugin } from "@hashintel/petrinaut/ui";

import { localCopyPlugin } from "./local-copy-plugin";
import { useSharedSearchNavigation } from "./use-shared-search-navigation";

import type { SharedExampleSearch } from "./example-search";
import type { PetrinautDocHandle } from "@hashintel/petrinaut-core";

const pageStyle = css({
  width: "[100vw]",
  height: "[100vh]",
  minWidth: "0",
  minHeight: "0",
  overflow: "hidden",
});

const readonlyDocumentPlugins: readonly PetrinautPlugin[] = [localCopyPlugin];

export type ReadonlyDocumentPageProps = {
  handle: PetrinautDocHandle;
  title: string;
  /** Writes the shared search subset back to the page URL. */
  onSearchChange: (
    search: SharedExampleSearch,
    history: "push" | "replace",
  ) => void;
  search: SharedExampleSearch;
};

/**
 * A full-page, read-only editor for a document the visitor does not own, such
 * as a published example or a shared snapshot, with a way to save an editable
 * copy.
 */
export const ReadonlyDocumentPage = ({
  handle,
  title,
  onSearchChange,
  search,
}: ReadonlyDocumentPageProps) => {
  const navigation = useSharedSearchNavigation(search, onSearchChange);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = `${title} · Petrinaut`;
    return () => {
      document.title = previousTitle;
    };
  }, [title]);

  return (
    <main className={pageStyle}>
      <Petrinaut
        handle={handle}
        hideNetManagementControls="except-title"
        navigation={navigation}
        plugins={readonlyDocumentPlugins}
        presentationProfile="review"
        readonly
        title={title}
      />
    </main>
  );
};
