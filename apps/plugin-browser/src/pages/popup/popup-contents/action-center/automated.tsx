import {
  Box,
  FormControlLabel,
  FormGroup,
  Switch,
  Typography,
} from "@mui/material";

import { LocalStorage } from "../../../../shared/storage";
import { SelectScope } from "./automated/select-scope";
import { Section } from "./shared/section";
import { SelectWebTarget } from "./shared/select-web-target";

export const Automated = ({
  automaticInferenceConfig,
  setAutomaticInferenceConfig,
  user,
}: {
  automaticInferenceConfig: LocalStorage["automaticInferenceConfig"];
  setAutomaticInferenceConfig: (
    newAutomaticInferenceConfig: LocalStorage["automaticInferenceConfig"],
  ) => void;
  user: NonNullable<LocalStorage["user"]>;
}) => {
  const { createAs, enabled, ownedById } = automaticInferenceConfig;

  return (
    <Box pb={1}>
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
                    setAutomaticInferenceConfig({
                      ...automaticInferenceConfig,
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
        description="Auto-inference only looks for types you specify on sites you allow"
        headerText="Limit scope"
      >
        <SelectScope
          inferenceConfig={automaticInferenceConfig}
          setInferenceConfig={setAutomaticInferenceConfig}
        />
      </Section>
      <Section
        description="Decide what happens when new entities and properties are identified"
        headerText="Entity processing"
      >
        <SelectWebTarget
          createAs={createAs}
          setCreateAs={(newCreateAs) =>
            setAutomaticInferenceConfig({
              ...automaticInferenceConfig,
              createAs: newCreateAs,
            })
          }
          ownedById={ownedById}
          setOwnedById={(newOwnedById) =>
            setAutomaticInferenceConfig({
              ...automaticInferenceConfig,
              ownedById: newOwnedById,
            })
          }
          user={user}
        />
      </Section>
    </Box>
  );
};
