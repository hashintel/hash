import { faArrowRight } from "@fortawesome/free-solid-svg-icons";
import { AlertModal, FontAwesomeIcon } from "@hashintel/design-system";
import { Box, Typography } from "@mui/material";
import { useMemo } from "react";

export type EntityTypeChangeDetails = {
  onAccept: () => void;
  proposedChange:
    | {
        entityTypeTitle: string;
        currentVersion: number;
        type: "Update";
        newVersion: number;
      }
    | {
        entityTypeTitle: string;
        currentVersion: number;
        type: "Remove";
      };
  linkChanges: {
    linkTitle: string;
    change:
      | "Added"
      | "Removed"
      | "Now required"
      | "Now array"
      | "No longer array"
      | "Target changed";
    blocking: boolean;
  }[];
  propertyChanges: {
    propertyTitle: string;
    change:
      | "Added"
      | "Removed"
      | "Now required"
      | "Type changed"
      | "Max items changed"
      | "Min items changed";
    blocking: boolean;
  }[];
};

type ChangeSummary = {
  blockCount: number;
  shouldWarn: boolean;
  totalChangeCount: number;
  linkChangeCount: {
    added: number;
    changedDestination: number;
    madeRequired: number;
    removed: number;
  };
  propertyChangeCount: {
    added: number;
    changedType: number;
    madeRequired: number;
    removed: number;
  };
};

const generateCountString = (count: number, type: "property" | "link") =>
  count > 1
    ? `${count} ${type === "property" ? "properties" : "links"}`
    : `${count} ${type}`;

const CalloutMessage = ({
  changeSummary: {
    blockCount,
    shouldWarn,
    totalChangeCount,
    linkChangeCount,
    propertyChangeCount,
  },
  type,
}: {
  changeSummary: ChangeSummary;
  type: "Update" | "Remove";
}) => {
  const prefix = `This ${type === "Update" ? "update" : "removal"} `;
  const messages: string[] = [];

  if (totalChangeCount === 0) {
    messages.push(
      "does not make any changes to properties or links for the entity.",
    );
  } else {
    {
      const { added, madeRequired, changedType, removed } = propertyChangeCount;
      if (added > 0) {
        messages.push(`adds ${generateCountString(added, "property")}`);
      }
      if (removed > 0) {
        messages.push(`removes ${generateCountString(removed, "property")}`);
      }
      if (changedType > 0) {
        messages.push(
          `changes the type of ${generateCountString(changedType, "property")}`,
        );
      }
      if (madeRequired > 0) {
        messages.push(
          `makes ${generateCountString(madeRequired, "property")} required`,
        );
      }
    }

    {
      const { added, madeRequired, changedDestination, removed } =
        linkChangeCount;
      if (added > 0) {
        messages.push(`adds ${generateCountString(added, "link")}`);
      }
      if (removed > 0) {
        messages.push(`removes ${generateCountString(removed, "link")}`);
      }
      if (changedDestination > 0) {
        messages.push(
          `changes the target of ${generateCountString(changedDestination, "link")}`,
        );
      }
      if (madeRequired > 0) {
        messages.push(
          `makes ${generateCountString(madeRequired, "link")} required`,
        );
      }
    }
  }

  const detail =
    prefix +
    messages.reduce((acc, message, index) => {
      if (index === 0) {
        return message;
      }
      if (index === messages.length - 1) {
        return `${acc} and ${message}`;
      }
      return `${acc}, ${message}`;
    }, "");

  return (
    <Typography
      sx={{
        fontSize: 14,
        fontWeight: 500,
        color: ({ palette }) => palette.gray[80],
      }}
    >
      <Box
        component="span"
        sx={{
          fontWeight: 700,
          color: ({ palette }) =>
            blockCount > 0
              ? palette.red[70]
              : shouldWarn
                ? palette.yellow[80]
                : palette.blue[70],
        }}
      >
        {blockCount > 0
          ? `${blockCount} blocking conflicts`
          : type === "Update"
            ? "Update available"
            : "Removal available"}
        {". "}
      </Box>
      {detail}
    </Typography>
  );
};

const ModalHeader = ({
  proposedChange,
}: {
  proposedChange: EntityTypeChangeDetails["proposedChange"];
}) => {
  return (
    <>
      {proposedChange.type}
      <strong> {proposedChange.entityTypeTitle}</strong>
      {" entity type "}
      <strong>v{proposedChange.currentVersion}</strong>
      {proposedChange.type === "Update" && (
        <>
          <FontAwesomeIcon icon={faArrowRight} sx={{ color: "gray.50" }} />
          <Box component="span" fontWeight={600} color="gray.90">
            v{proposedChange.newVersion}
          </Box>
        </>
      )}
    </>
  );
};

export type EntityTypeChangeModalProps = EntityTypeChangeDetails & {
  changeIsProcessing: boolean;
  onReject: () => void;
  open: boolean;
};

export const EntityTypeChangeModal = ({
  changeIsProcessing,
  linkChanges,
  onAccept,
  onReject,
  proposedChange,
  propertyChanges,
  open,
}: EntityTypeChangeModalProps) => {
  /**
   * @todo H-3408 – use this summary to show a table of changes, which are blocking, etc.
   */
  const changeSummary = useMemo<ChangeSummary>(() => {
    const summary: ChangeSummary = {
      blockCount: 0,
      shouldWarn: false,
      totalChangeCount: linkChanges.length + propertyChanges.length,
      linkChangeCount: {
        added: 0,
        changedDestination: 0,
        madeRequired: 0,
        removed: 0,
      },
      propertyChangeCount: {
        added: 0,
        changedType: 0,
        madeRequired: 0,
        removed: 0,
      },
    };

    for (const propertyChange of propertyChanges) {
      if (propertyChange.blocking) {
        summary.blockCount++;
      }
      if (propertyChange.change === "Added") {
        summary.propertyChangeCount.added++;
      }
      if (propertyChange.change === "Removed") {
        summary.propertyChangeCount.removed++;
        summary.shouldWarn = true;
      }
      if (propertyChange.change === "Now required") {
        summary.propertyChangeCount.madeRequired++;
      }
      if (propertyChange.change === "Type changed") {
        summary.propertyChangeCount.changedType++;
        summary.shouldWarn = true;
      }
    }

    for (const linkChange of linkChanges) {
      if (linkChange.blocking) {
        summary.blockCount++;
      }
      if (linkChange.change === "Added") {
        summary.linkChangeCount.added++;
      }
      if (linkChange.change === "Removed") {
        summary.linkChangeCount.removed++;
        summary.shouldWarn = true;
      }
      if (linkChange.change === "Now required") {
        summary.linkChangeCount.madeRequired++;
      }
      if (linkChange.change === "Target changed") {
        summary.linkChangeCount.changedDestination++;
        summary.shouldWarn = true;
      }
    }

    return summary;
  }, [linkChanges, propertyChanges]);

  const { blockCount, shouldWarn } = changeSummary;

  return (
    <AlertModal
      callback={blockCount ? undefined : onAccept}
      calloutMessage={
        <strong>Proceed with change?</strong>
        // @todo H-3408 – uncomment this when changes are calculated by the parent component
        // <CalloutMessage
        //   changeSummary={changeSummary}
        //   type={proposedChange.type}
        // />
      }
      close={onReject}
      confirmButtonText={`${proposedChange.type} entity type`}
      header={<ModalHeader proposedChange={proposedChange} />}
      open={open}
      processing={changeIsProcessing}
      type={blockCount > 0 ? "error" : shouldWarn ? "warning" : "info"}
    >
      {/* @todo H-3408 – replace this with a proper list of changes */}
      <Typography variant="smallTextParagraphs" color="gray.80">
        Updating the type an entity is assigned to may cause property values to
        be removed, if properties have been removed from the type or if their
        expected values have changed to be incompatible with existing data.
      </Typography>
    </AlertModal>
  );
};
