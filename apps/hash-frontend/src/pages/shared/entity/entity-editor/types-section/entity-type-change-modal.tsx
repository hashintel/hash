import type { BaseUrl, OntologyTypeVersion } from "@blockprotocol/type-system";
import { faArrowRight } from "@fortawesome/free-solid-svg-icons";
import {
  AlertModal,
  FontAwesomeIcon,
  LinkIcon,
} from "@hashintel/design-system";
import {
  Box,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from "@mui/material";
import { useCallback, useMemo } from "react";

export type EntityTypeChangeDetails = {
  onAccept: (args: {
    removedPropertiesBaseUrls: BaseUrl[];
    removedLinkTypesBaseUrls: BaseUrl[];
  }) => void;
  proposedChange:
    | {
        entityTypeTitle: string;
        currentVersion: OntologyTypeVersion;
        type: "Update";
        newVersion: OntologyTypeVersion;
      }
    | {
        entityTypeTitle: string;
        currentVersion: OntologyTypeVersion;
        type: "Remove";
      };
  linkChanges: {
    linkTypeBaseUrl: BaseUrl;
    linkTitle: string;
    change:
      | "Added (optional)"
      | "Added (required)"
      | "Link version changed"
      | "Now required"
      | "Min items changed"
      | "Max items changed"
      | "Removed"
      | "Target type(s) changed";
  }[];
  propertyChanges: {
    propertyBaseUrl: BaseUrl;
    propertyTitle: string;
    change:
      | "Added (optional)"
      | "Added (required)"
      | "No longer a list"
      | "Now a list"
      | "Now required"
      | "Min items changed"
      | "Max items changed"
      | "Removed"
      | "Value type changed";
  }[];
};

type ChangeSummary = {
  shouldWarn: boolean;
  totalChangeCount: number;
  linkChangeCount: {
    added: number;
    changedDestination: number;
    minItemsChanged: number;
    maxItemsChanged: number;
    nowRequired: number;
    removed: number;
    versionChanged: number;
  };
  propertyChangeCount: {
    added: number;
    minItemsChanged: number;
    maxItemsChanged: number;
    noLongerList: number;
    nowList: number;
    nowRequired: number;
    removed: number;
    typeChanged: number;
  };
};

const generateCountString = (count: number, type: "property" | "link") =>
  count > 1
    ? `${count} ${type === "property" ? "properties" : "links"}`
    : `${count} ${type}`;

const CalloutMessage = ({
  changeSummary: {
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
  const prefix = `This `;
  const messages: string[] = [];

  if (totalChangeCount === 0) {
    messages.push(
      "does not make any changes to properties or links for the entity",
    );
  } else {
    {
      const {
        added,
        minItemsChanged,
        maxItemsChanged,
        noLongerList,
        nowRequired,
        nowList,
        typeChanged,
        removed,
      } = propertyChangeCount;
      if (added > 0) {
        messages.push(`adds ${generateCountString(added, "property")}`);
      }
      if (removed > 0) {
        messages.push(`removes ${generateCountString(removed, "property")}`);
      }
      if (typeChanged > 0) {
        messages.push(
          `changes the expected type of ${generateCountString(typeChanged, "property")}`,
        );
      }
      if (nowRequired > 0) {
        messages.push(
          `makes ${generateCountString(nowRequired, "property")} required`,
        );
      }
      if (nowList > 0) {
        messages.push(
          `makes ${generateCountString(nowList, "property")} a list`,
        );
      }
      if (noLongerList > 0) {
        messages.push(
          `makes ${generateCountString(noLongerList, "property")} no longer a list`,
        );
      }
      if (minItemsChanged > 0) {
        messages.push(
          `changes the minimum number of items for ${generateCountString(minItemsChanged, "property")}`,
        );
      }
      if (maxItemsChanged > 0) {
        messages.push(
          `changes the maximum number of items for ${generateCountString(maxItemsChanged, "property")}`,
        );
      }
    }

    {
      const {
        added,
        minItemsChanged,
        maxItemsChanged,
        nowRequired,
        changedDestination,
        removed,
        versionChanged,
      } = linkChangeCount;
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
      if (nowRequired > 0) {
        messages.push(
          `makes ${generateCountString(nowRequired, "link")} required`,
        );
      }
      if (minItemsChanged > 0) {
        messages.push(
          `changes the minimum number of items for ${generateCountString(minItemsChanged, "link")}`,
        );
      }
      if (maxItemsChanged > 0) {
        messages.push(
          `changes the maximum number of items for ${generateCountString(maxItemsChanged, "link")}`,
        );
      }
      if (versionChanged > 0) {
        messages.push(
          `changes the type version of ${generateCountString(versionChanged, "link")}`,
        );
      }
    }
  }

  const detail = `${
    prefix +
    messages.reduce((acc, message, index) => {
      if (index === 0) {
        return message;
      }
      if (index === messages.length - 1) {
        return `${acc} and ${message}`;
      }
      return `${acc}, ${message}`;
    }, "")
  }.`;

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
            shouldWarn ? palette.yellow[80] : palette.blue[70],
        }}
      >
        {type === "Update" ? "Update type" : "Removing type"}
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
    <Stack
      direction="row"
      alignItems="center"
      gap={0.6}
      sx={{ fontWeight: 500, color: ({ palette }) => palette.gray[80] }}
    >
      {proposedChange.type}
      <Box component="span" fontWeight={600}>
        {" "}
        {proposedChange.entityTypeTitle}
      </Box>
      {" entity type "}
      <Box component="span" fontWeight={600}>
        v{proposedChange.currentVersion.toString()}
      </Box>
      {proposedChange.type === "Update" && (
        <>
          <FontAwesomeIcon icon={faArrowRight} sx={{ color: "gray.50" }} />
          <Box component="span" fontWeight={700} color="gray.90">
            v{proposedChange.newVersion.toString()}
          </Box>
        </>
      )}
    </Stack>
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
  const changeSummary = useMemo<ChangeSummary>(() => {
    const summary: ChangeSummary = {
      shouldWarn: false,
      totalChangeCount: linkChanges.length + propertyChanges.length,
      linkChangeCount: {
        added: 0,
        changedDestination: 0,
        minItemsChanged: 0,
        maxItemsChanged: 0,
        nowRequired: 0,
        removed: 0,
        versionChanged: 0,
      },
      propertyChangeCount: {
        added: 0,
        minItemsChanged: 0,
        maxItemsChanged: 0,
        noLongerList: 0,
        nowList: 0,
        nowRequired: 0,
        typeChanged: 0,
        removed: 0,
      },
    };

    for (const propertyChange of propertyChanges) {
      if (
        propertyChange.change === "Added (optional)" ||
        propertyChange.change === "Added (required)"
      ) {
        summary.propertyChangeCount.added++;
      }
      if (propertyChange.change === "Now required") {
        summary.propertyChangeCount.nowRequired++;
      }
      if (propertyChange.change === "Min items changed") {
        summary.propertyChangeCount.minItemsChanged++;
      }
      if (propertyChange.change === "Max items changed") {
        summary.propertyChangeCount.maxItemsChanged++;
      }
      if (propertyChange.change === "Now a list") {
        summary.propertyChangeCount.nowList++;
      }
      if (propertyChange.change === "No longer a list") {
        summary.propertyChangeCount.noLongerList++;
      }
      if (propertyChange.change === "Removed") {
        summary.propertyChangeCount.removed++;
        summary.shouldWarn = true;
      }
      if (propertyChange.change === "Value type changed") {
        summary.propertyChangeCount.typeChanged++;
        summary.shouldWarn = true;
      }
    }

    for (const linkChange of linkChanges) {
      if (
        linkChange.change === "Added (optional)" ||
        linkChange.change === "Added (required)"
      ) {
        summary.linkChangeCount.added++;
      }
      if (linkChange.change === "Link version changed") {
        summary.linkChangeCount.versionChanged++;
      }
      if (linkChange.change === "Min items changed") {
        summary.linkChangeCount.minItemsChanged++;
      }
      if (linkChange.change === "Max items changed") {
        summary.linkChangeCount.maxItemsChanged++;
      }
      if (linkChange.change === "Now required") {
        summary.linkChangeCount.nowRequired++;
      }
      if (linkChange.change === "Removed") {
        summary.linkChangeCount.removed++;
        summary.shouldWarn = true;
      }
      if (linkChange.change === "Target type(s) changed") {
        summary.linkChangeCount.changedDestination++;
        summary.shouldWarn = true;
      }
    }

    return summary;
  }, [linkChanges, propertyChanges]);

  const { shouldWarn } = changeSummary;

  const propertyChangesByTitle = Object.groupBy(
    propertyChanges,
    (change) => change.propertyTitle,
  );

  const linkChangseByTitle = Object.groupBy(
    linkChanges,
    (change) => change.linkTitle,
  );

  const acceptCallback = useCallback(() => {
    onAccept({
      removedLinkTypesBaseUrls: linkChanges
        .filter((change) => change.change === "Removed")
        .map((change) => change.linkTypeBaseUrl),
      removedPropertiesBaseUrls: propertyChanges
        .filter((change) => change.change === "Removed")
        .map((change) => change.propertyBaseUrl),
    });
  }, [linkChanges, onAccept, propertyChanges]);

  return (
    <AlertModal
      callback={acceptCallback}
      calloutMessage={
        <CalloutMessage
          changeSummary={changeSummary}
          type={proposedChange.type}
        />
      }
      close={onReject}
      confirmButtonText={`${proposedChange.type} entity type`}
      header={<ModalHeader proposedChange={proposedChange} />}
      open={open}
      processing={changeIsProcessing}
      type={shouldWarn ? "warning" : "info"}
    >
      {changeSummary.totalChangeCount !== 0 && (
        <Table
          sx={({ palette }) => ({
            background: palette.gray[10],
            border: `1px solid ${palette.gray[30]}`,
            borderRadius: 2,
            borderCollapse: "separate",
            th: {
              background: palette.gray[20],
              fontWeight: 600,
              fontSize: 11,
              textTransform: "uppercase",
            },
            td: {
              fontWeight: 500,
              fontSize: 14,
            },
            "& th, td": {
              color: palette.gray[80],
              lineHeight: 1,
              px: 1.5,
              py: 1.5,
            },
            "& tr:last-child td:first-of-type": {
              borderBottomLeftRadius: 8,
            },
            "& tr:last-of-type td:last-of-type": {
              borderBottomRightRadius: 8,
            },
            "& tbody tr:last-of-type td": {
              pb: 2.25,
            },
            "& tbody tr:first-of-type td": {
              pt: 2.25,
            },
          })}
        >
          <TableHead>
            <TableRow>
              <TableCell sx={{ borderTopLeftRadius: 8 }}>#</TableCell>
              <TableCell>Name</TableCell>
              <TableCell sx={{ borderTopRightRadius: 8 }}>Change</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {Object.entries(propertyChangesByTitle)
              .sort(([aTitle], [bTitle]) => aTitle.localeCompare(bTitle))
              .map(([propertyTitle, changes = []], index) => (
                <TableRow key={propertyTitle}>
                  <TableCell>{index + 1}</TableCell>
                  <TableCell>{propertyTitle}</TableCell>
                  <TableCell>
                    {changes.length > 1 ? "Multiple" : changes[0]!.change}
                  </TableCell>
                </TableRow>
              ))}
            {Object.entries(linkChangseByTitle).map(
              ([linkTitle, changes = []], index) => (
                <TableRow key={linkTitle}>
                  <TableCell>{index + 1 + propertyChanges.length}</TableCell>
                  <TableCell>
                    <Stack alignItems="center" direction="row" gap={0.5}>
                      {linkTitle}
                      <LinkIcon
                        sx={{
                          fontSize: 12,
                          color: ({ palette }) => palette.gray[50],
                        }}
                      />
                    </Stack>
                  </TableCell>
                  <Tooltip
                    title={changes.length > 1 ? <Box>Multiple</Box> : ""}
                  >
                    <TableCell>
                      {changes.length > 1 ? "Multiple" : changes[0]!.change}
                    </TableCell>
                  </Tooltip>
                </TableRow>
              ),
            )}
          </TableBody>
        </Table>
      )}
    </AlertModal>
  );
};
