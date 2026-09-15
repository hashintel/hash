import { useEffect, useState } from "react";

import { Button } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";
import { Petrinaut } from "@hashintel/petrinaut/ui";

import { useSharedSearchNavigation } from "../../examples/use-shared-search-navigation";
import { ShareSnapshotButton } from "../../sharing/share-snapshot-button";

import type { SharedExampleSearch } from "../../examples/example-search";
import type { PetrinautDocHandle } from "@hashintel/petrinaut-core";

export type ReadonlyDocumentPageProps = {
  handle: PetrinautDocHandle;
  title: string;
  onFork: () => void;
  onSearchChange: (
    search: SharedExampleSearch,
    history: "push" | "replace",
  ) => void;
  search: SharedExampleSearch;
};

export const ReadonlyDocumentPage = ({
  handle,
  title,
  onFork,
  onSearchChange,
  search,
}: ReadonlyDocumentPageProps) => {
  const [forkError, setForkError] = useState<string | null>(null);
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
    document.title = `${title} · Petrinaut`;
    return () => {
      document.title = previousTitle;
    };
  }, [title]);

  return (
    <main
      className={css({
        width: "[100vw]",
        height: "[100vh]",
        minWidth: "0",
        minHeight: "0",
        overflow: "hidden",
      })}
    >
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
            <div
              className={css({
                display: "flex",
                alignItems: "center",
                gap: "2",
              })}
            >
              <ShareSnapshotButton
                getSnapshot={() => ({ title, definition: handle.doc()! })}
                search={search}
              />
              <Button size="xs" variant="subtle" onClick={forkLocalCopy}>
                Make a local copy
              </Button>
            </div>
          ),
          topBarStart: (
            <span
              className={css({
                minWidth: "0",
                overflow: "hidden",
                color: "neutral.s90",
                fontSize: "sm",
                fontWeight: "medium",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              })}
            >
              {title}
            </span>
          ),
        }}
        title={title}
      />
    </main>
  );
};
