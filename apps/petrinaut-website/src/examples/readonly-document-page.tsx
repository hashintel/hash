import { useEffect, useState } from "react";

import { Button } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";
import { Petrinaut } from "@hashintel/petrinaut/ui";

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

const titleStyle = css({
  minWidth: "0",
  overflow: "hidden",
  color: "neutral.s90",
  fontSize: "sm",
  fontWeight: "medium",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

const copyFailedStyle = css({
  color: "red.s100",
  fontSize: "xs",
  whiteSpace: "nowrap",
});

export type ReadonlyDocumentPageProps = {
  handle: PetrinautDocHandle;
  title: string;
  /** Saves an editable copy and opens it. Throws when the browser refuses to save it. */
  onMakeLocalCopy: () => void;
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
  onMakeLocalCopy,
  onSearchChange,
  search,
}: ReadonlyDocumentPageProps) => {
  const navigation = useSharedSearchNavigation(search, onSearchChange);
  const [copyFailed, setCopyFailed] = useState(false);
  const makeLocalCopy = () => {
    try {
      onMakeLocalCopy();
    } catch {
      setCopyFailed(true);
    }
  };

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
        hideNetManagementControls="all"
        navigation={navigation}
        presentationProfile="review"
        readonly
        readOnlyAction={{ label: "Make a local copy", onClick: makeLocalCopy }}
        slots={{
          topBarEnd: (
            <>
              {copyFailed ? (
                <span className={copyFailedStyle} role="alert">
                  Couldn't save: browser storage is full or blocked
                </span>
              ) : null}
              <Button size="sm" variant="subtle" onClick={makeLocalCopy}>
                Make a local copy
              </Button>
            </>
          ),
          topBarStart: <span className={titleStyle}>{title}</span>,
        }}
        title={title}
      />
    </main>
  );
};
