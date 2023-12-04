import {
  Box,
  FormControlLabel,
  FormGroup,
  Switch,
  Typography,
} from "@mui/material";

import { LocalStorage } from "../../../../shared/storage";
import { useLocalStorage } from "../../../shared/use-local-storage";
import { SelectScope } from "./automated/select-scope";
import { Section } from "./shared/section";
import { SelectWebTarget } from "./shared/select-web-target";

export const Automated = ({
  user,
}: {
  user: NonNullable<LocalStorage["user"]>;
}) => {
  const [inferenceConfig, setInferenceConfig] = useLocalStorage(
    "automaticInferenceConfig",
    {
      createAs: "draft",
      enabled: false,
      ownedById: user.webOwnedById,
      rules: [],
    },
  );

  const { createAs, enabled, ownedById } = inferenceConfig;

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
        description="Auto-inference only looks for types you specify on sites you allow"
        headerText="Limit scope"
      >
        <SelectScope
          inferenceConfig={inferenceConfig}
          setInferenceConfig={setInferenceConfig}
        />
      </Section>
      <Section
        description="Decide what happens when new entities and properties are identified"
        headerText="Entity processing"
      >
        <SelectWebTarget
          createAs={createAs}
          setCreateAs={(newCreateAs) =>
            setInferenceConfig({
              ...inferenceConfig,
              createAs: newCreateAs,
            })
          }
          ownedById={ownedById}
          setOwnedById={(newOwnedById) =>
            setInferenceConfig({
              ...inferenceConfig,
              ownedById: newOwnedById,
            })
          }
          user={user}
        />
      </Section>
    </>
  );
};
