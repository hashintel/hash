import type { Dispatch, PropsWithChildren, SetStateAction , useState } from "react";
import {
  CaretDownSolidIcon,
  IconButton,
  TextField,
} from "@hashintel/design-system";
import type { GoogleSheet } from "@local/hash-isomorphic-utils/flows/types";
import {
  Box,
  Checkbox,
  Collapse,
  outlinedInputClasses,
  Stack,
  Typography,
} from "@mui/material";

import { GoogleAccountSelect } from "../../shared/integrations/google/google-account-select";
import { GoogleAuthProvider } from "../../shared/integrations/google/google-auth-context";
import { SelectOrNameGoogleSheet } from "../../shared/integrations/google/select-or-name-google-sheet";

type DocumentSetting = {
  brief?: string;
} | null;

type GoogleSheetSetting = {
  googleAccountId?: string;
  googleSheet?: GoogleSheet;
} | null;

const DeliverableSetting = ({
  checked,
  children,
  onChangeChecked,
  label,
  subLabel,
}: PropsWithChildren<{
  checked: boolean;
  onChangeChecked: (checked: boolean) => void;
  label: string;
  subLabel: string;
}>) => {
  const [showSettingsDetail, setShowSettingsDetail] = useState(false);

  const checkboxId = `deliverable-settings-${label}-checkbox`;

  return (
    <Box>
      <Stack direction={"row"} alignItems={"center"}>
        <Checkbox
          checked={checked}
          id={checkboxId}
          sx={{ "& .MuiSvgIcon-root": { fontSize: 18 }, mr: 1 }}
          onChange={() => {
            onChangeChecked(!checked);
            if (checked) {
              setShowSettingsDetail(false);
            } else {
              setShowSettingsDetail(true);
            }
          }}
        />
        <Box
          component={"label"}
          htmlFor={checkboxId}
          sx={{ fontSize: 14, cursor: "pointer" }}
        >
          {label}
        </Box>
        <IconButton
          unpadded
          rounded
          size={"small"}
          sx={({ transitions }) => ({
            visibility: "visible",
            pointerEvents: "auto",
            transform: showSettingsDetail ? "none" : "rotate(-90deg)",
            transition: transitions.create("transform", {
              duration: 300,
            }),
          })}
          onClick={(event) => {
            event.stopPropagation();
            setShowSettingsDetail(!showSettingsDetail);
          }}
        >
          <CaretDownSolidIcon />
        </IconButton>
        <Typography
          sx={{
            fontSize: 14,
            color: ({ palette }) => palette.gray[60],
            ml: 1,
          }}
        >
          {subLabel}
        </Typography>
      </Stack>
      <Collapse in={showSettingsDetail}>
        <Box py={1.5}>{children}</Box>
      </Collapse>
    </Box>
  );
};

const SpreadsheetSettings = ({
  spreadsheetSettings,
  setSpreadsheetSettings,
}: {
  spreadsheetSettings: GoogleSheetSetting;
  setSpreadsheetSettings: (settings: GoogleSheetSetting) => void;
}) => {
  return (
    <DeliverableSetting
      checked={Boolean(spreadsheetSettings)}
      label={"Spreadsheet"}
      subLabel={"Sync entities to a Google Sheet"}
      onChangeChecked={() =>
        { spreadsheetSettings
          ? setSpreadsheetSettings(null)
          : setSpreadsheetSettings({}); }
      }
    >
      <GoogleAuthProvider>
        <Box mb={1.5}>
          <GoogleAccountSelect
            googleAccountId={spreadsheetSettings?.googleAccountId}
            setGoogleAccountId={(newAccountId) =>
              spreadsheetSettings
                ? setSpreadsheetSettings({
                    ...spreadsheetSettings,
                    googleAccountId: newAccountId,
                  })
                : null
            }
          />
        </Box>
        <SelectOrNameGoogleSheet
          googleAccountId={spreadsheetSettings?.googleAccountId}
          googleSheet={spreadsheetSettings?.googleSheet}
          setGoogleSheet={(newGoogleSheet) =>
            { setSpreadsheetSettings({
              ...spreadsheetSettings,
              googleSheet: newGoogleSheet,
            }); }
          }
        />
      </GoogleAuthProvider>
    </DeliverableSetting>
  );
};

const DocumentSettings = ({
  documentSettings,
  setDocumentSettings,
}: {
  documentSettings: DocumentSetting;
  setDocumentSettings: (settings: DocumentSetting) => void;
}) => {
  return (
    <DeliverableSetting
      checked={Boolean(documentSettings)}
      label={"Document"}
      subLabel={"Outputs in markdown format"}
      onChangeChecked={() =>
        { documentSettings ? setDocumentSettings(null) : setDocumentSettings({}); }
      }
    >
      <Box>
        <TextField
          value={documentSettings?.brief}
          placeholder={"What should the report focus on?"}
          sx={{
            width: "100%",
            [`.${outlinedInputClasses.root} input`]: {
              fontSize: 15,
              px: 2.5,
              py: 1.5,
            },
          }}
          onChange={(event) => {
            setDocumentSettings({
              ...documentSettings,
              brief: event.target.value,
            });
          }}
        />
      </Box>
    </DeliverableSetting>
  );
};

export interface DeliverableSettingsState {
  document: DocumentSetting;
  spreadsheet: GoogleSheetSetting;
}

interface DeliverableSettingsProps {
  settings: DeliverableSettingsState;
  setSettings: Dispatch<SetStateAction<DeliverableSettingsState>>;
}

export const DeliverableSettings = ({
  settings,
  setSettings,
}: DeliverableSettingsProps) => {
  return (
    <Box>
      <SpreadsheetSettings
        spreadsheetSettings={settings.spreadsheet}
        setSpreadsheetSettings={(newSpreadsheetSettings) =>
          { setSettings((currentSettings) => ({
            ...currentSettings,
            spreadsheet: newSpreadsheetSettings,
          })); }
        }
      />
      <Box sx={{ mt: 1 }}>
        <DocumentSettings
          documentSettings={settings.document}
          setDocumentSettings={(newDocumentSettings) =>
            { setSettings((currentSettings) => ({
              ...currentSettings,
              document: newDocumentSettings,
            })); }
          }
        />
      </Box>
    </Box>
  );
};
