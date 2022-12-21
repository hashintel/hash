import { faClose } from "@fortawesome/free-solid-svg-icons";
import {
  Button,
  FontAwesomeIcon,
  IconButton,
} from "@hashintel/hash-design-system";
import { Box, Stack, Typography } from "@mui/material";
import { bindDialog, PopupState } from "material-ui-popup-state/hooks";
import { Fragment } from "react";
import { Modal } from "../../../../../../../../../../../../components/Modals/Modal";

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
  popupState: PopupState;
  onClose: () => void;
  onDelete?: () => void;
  dataTypeCount: number;
  arrayCount: number;
  propertyObjectCount: number;
}

export const DeleteExpectedValueModal = ({
  popupState,
  onClose,
  onDelete,
  dataTypeCount,
  arrayCount,
  propertyObjectCount,
}: DeleteExpectedValueModalProps) => {
  const countArray = [
    { label: "data type", count: dataTypeCount },
    { label: "array", count: arrayCount },
    { label: "property object", count: propertyObjectCount },
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
            Remove array and its contents
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
              This array contains <CountGroup items={countArray} />
              {dataTypeCount + propertyObjectCount + arrayCount > 1
                ? " These "
                : " This "}
              will be removed from your expected value definition if you
              continue and will need to be individually re-added should you wish
              to restore them. Proceed with caution.
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
              Confirm deletion
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
