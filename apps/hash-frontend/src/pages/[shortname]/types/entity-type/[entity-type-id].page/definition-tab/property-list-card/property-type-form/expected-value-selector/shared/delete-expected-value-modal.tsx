import { faClose } from "@fortawesome/free-solid-svg-icons";
import { Button, FontAwesomeIcon, IconButton } from "@hashintel/design-system";
import { Box, Stack, Typography } from "@mui/material";
import { bindDialog, PopupState } from "material-ui-popup-state/hooks";
import { Fragment } from "react";

import { Modal } from "../../../../../../../../../../components/modals/modal";

type CountItemProps = { label: string; count: number };

const CountItem = ({ label, count }: CountItemProps) => (
  <strong>
    {count} {label}
    {count > 1 ? <>s</> : null}
  </strong>
);

const CountGroup = ({ items }: { items: CountItemProps[] }) => (
  <>
    {items.map((item, index) => (
      <Fragment key={item.label}>
        <CountItem {...item} />
        {items[index + 2] ? <>, </> : items[index + 1] ? <> and </> : <>.</>}
      </Fragment>
    ))}
  </>
);

interface DeleteExpectedValueModalProps {
  expectedValueType: "array" | "property object";
  popupState: PopupState;
  editing: boolean;
  onClose: () => void;
  onDelete?: () => void;
  dataTypeCount?: number;
  arrayCount?: number;
  propertyObjectCount?: number;
  propertyTypeCount?: number;
}

export const DeleteExpectedValueModal = ({
  expectedValueType,
  popupState,
  editing,
  onClose,
  onDelete,
  dataTypeCount = 0,
  arrayCount = 0,
  propertyObjectCount = 0,
  propertyTypeCount = 0,
}: DeleteExpectedValueModalProps) => {
  const countArray = [
    { label: "data type", count: dataTypeCount },
    { label: "array", count: arrayCount },
    { label: "property object", count: propertyObjectCount },
    { label: "property type", count: propertyTypeCount },
  ].filter(({ count }) => count);

  return (
    <Modal
      {...bindDialog(popupState)}
      contentStyle={(theme) => ({
        p: "0px !important",
        border: 1,
        borderColor: theme.palette.gray[20],
      })}
    >
      <>
        <Box
          sx={{
            height: 56,
            padding: 2.5,
            borderBottom: ({ palette }) => `1px solid ${palette.gray[20]}`,
          }}
        >
          <Typography
            variant="largeTextLabels"
            sx={{
              fontSize: 16,
              color: ({ palette }) => palette.gray[80],
              fontWeight: 500,
            }}
          >
            {!editing
              ? `Remove ${expectedValueType} and its contents`
              : `Revert changes made to ${expectedValueType}`}
          </Typography>

          <IconButton
            sx={{ position: "absolute", top: 16, right: 16 }}
            onClick={onClose}
          >
            <FontAwesomeIcon icon={faClose} />
          </IconButton>
        </Box>
        <Box sx={{ padding: 3 }}>
          <Box sx={{ marginBottom: 2, fontSize: 14, lineHeight: "18px" }}>
            <Typography
              variant="smallTextLabels"
              sx={{ color: ({ palette }) => palette.gray[80] }}
            >
              This {expectedValueType} contains{" "}
              <CountGroup items={countArray} />{" "}
              {!editing
                ? `${
                    dataTypeCount + propertyObjectCount + arrayCount > 1
                      ? "These "
                      : "This "
                  }
                will be removed from your expected value definition if you continue and will need to be individually re-added should
                you wish to restore them.`
                : "Changes made while editing will be reverted if you continue."}{" "}
              Proceed with caution.
            </Typography>
          </Box>

          <Stack direction="row" gap={1.25}>
            <Button
              variant="danger"
              size="small"
              onClick={() => {
                onDelete?.();
                onClose();
              }}
            >
              {!editing ? "Confirm deletion" : "Revert changes"}
            </Button>
            <Button variant="tertiary" size="small" onClick={onClose}>
              Cancel
            </Button>
          </Stack>
        </Box>
      </>
    </Modal>
  );
};
