import { Box, Typography } from "@mui/material";
import { useEffect } from "react";
import { useFormContext, useWatch } from "react-hook-form";

import { useEntityTypesOptions } from "../shared/entity-types-options-context";
import { useIsReadonly } from "../shared/read-only-context";
import { LinkListCard } from "./link-list-card";

import type { EntityTypeEditorFormData } from "../shared/form-types";

/**
 * The outgoing links defined on the type being edited. Hidden when that type
 * is a link type, because a link cannot have links of its own, and any links
 * already in the form are cleared so they are not saved.
 */
export const LinksSection = ({ typeTitle }: { typeTitle: string }) => {
  const { control, setValue } = useFormContext<EntityTypeEditorFormData>();

  const directParentEntityTypeIds = useWatch({
    control,
    name: "allOf",
  });

  const links = useWatch({
    control,
    name: "links",
  });

  const { linkTypes } = useEntityTypesOptions();

  const isReadonly = useIsReadonly();

  const isLinkType = directParentEntityTypeIds.some((id) => linkTypes[id]);

  useEffect(() => {
    if (isLinkType && !isReadonly && links.length > 0) {
      setValue("links", [], { shouldDirty: true });
    }
  }, [isLinkType, isReadonly, links.length, setValue]);

  if (isLinkType) {
    return null;
  }

  return (
    <Box>
      <Typography variant="h5" mb={2}>
        Links defined on{" "}
        <Box component="span" sx={{ fontWeight: "bold" }}>
          {typeTitle}
        </Box>
      </Typography>
      <LinkListCard />
    </Box>
  );
};
