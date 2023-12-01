import {
  Box,
  FormControlLabel,
  FormGroup,
  Radio,
  RadioGroup,
  Switch,
  SxProps,
  Theme,
  Typography,
} from "@mui/material";

import { useLocalStorage } from "../../../shared/use-storage-sync";
import { Section } from "./shared/section";

const createRadioItemSx = (active: boolean): SxProps<Theme> => ({
  color: ({ palette }) => (active ? palette.gray[90] : palette.gray[80]),
  m: 0,
  "&:not(:last-child)": {
    mb: 1.5,
  },
});

export const Automated = () => {
  const [inferenceConfig, setInferenceConfig] = useLocalStorage(
    "automaticInference",
    { createAs: "draft", enabled: false, rules: [] },
  );

  const { createAs, enabled, rules } = inferenceConfig;

  return (
    <>
      <Section
        description="Automatically identify entities and attributes for you as you browse"
        headerText="Auto-inference Actions"
      >
        <Box>
          <FormGroup>
            <FormControlLabel
              control={
                <Switch
                  checked={enabled}
                  onChange={(event) =>
                    setInferenceConfig({
                      ...inferenceConfig,
                      enabled: event.target.checked,
                    })
                  }
                  sx={{ mr: 2 }}
                />
              }
              label={
                <Typography
                  sx={{
                    color: ({ palette }) =>
                      enabled ? palette.blue[70] : palette.gray[90],
                    fontWeight: enabled ? 600 : 400,
                  }}
                >
                  {enabled ? "Enabled" : "Disabled"}
                </Typography>
              }
              sx={{ m: 0 }}
            />
          </FormGroup>
        </Box>
      </Section>
      <Section
        description="Decide what happens when new entities and properties are identified"
        headerText="Entity processing"
      >
        <RadioGroup
          aria-labelledby="demo-radio-buttons-group-label"
          name="radio-buttons-group"
          onChange={(event) =>
            setInferenceConfig({
              ...inferenceConfig,
              createAs: event.target.value as "draft" | "live",
            })
          }
          value={createAs}
        >
          <FormControlLabel
            value="draft"
            control={<Radio sx={{ mr: 1 }} />}
            label="Add them to a review queue"
            sx={createRadioItemSx(createAs === "draft")}
          />
          <FormControlLabel
            value="live"
            control={<Radio sx={{ mr: 1 }} />}
            label="Create them automatically in"
            sx={createRadioItemSx(createAs === "live")}
          />
        </RadioGroup>
      </Section>
    </>
  );
};
