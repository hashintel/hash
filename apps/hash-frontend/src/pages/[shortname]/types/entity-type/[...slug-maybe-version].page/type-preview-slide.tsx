import {
  EntityType,
  PropertyType,
  VersionedUrl,
} from "@blockprotocol/type-system";
import { EntityTypeEditor } from "@hashintel/type-editor";
import { Box, Button, Slide } from "@mui/material";
import { FunctionComponent, useMemo, useState } from "react";

interface TypePreviewSlideProps {
  type: EntityType;
  entityTypeOptions: Record<VersionedUrl, EntityType>;
  propertyTypeOptions: Record<VersionedUrl, PropertyType>;
}

export const TypePreviewSlide: FunctionComponent<TypePreviewSlideProps> = ({
  type,
  entityTypeOptions,
  propertyTypeOptions,
}) => {
  console.log(entityTypeOptions);
  console.log(propertyTypeOptions);

  // const propertyTypeOptions2 = useMemo(() => {
  //   return Object.fromEntries(
  //     propertyTypeOptions.map((propertyType) => [
  //       propertyType.schema.$id,
  //       propertyType.schema,
  //     ]),
  //   );
  // }, [propertyTypeOptions]);

  const propertyTypeOptions2 = useMemo(() => {
    return Object.fromEntries(
      Object.entries(propertyTypeOptions).map(([$id, propertyType]) => [
        $id,
        propertyType.schema,
      ]),
    );
  }, [propertyTypeOptions]);

  const entityTypeOptions2 = useMemo(() => {
    return Object.fromEntries(
      entityTypeOptions.map((entityType) => [
        entityType.schema.$id,
        entityType.schema,
      ]),
    );
  }, [entityTypeOptions]);

  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(!open)}>open</Button>
      <Slide in={open} direction="left">
        <Box
          sx={{
            height: 1,
            width: 800,
            background: "white",
            position: "absolute",
            top: 0,
            right: 0,
            zIndex: 9999,
          }}
        >
          <EntityTypeEditor
            entityType={type}
            entityTypeOptions={entityTypeOptions2}
            propertyTypeOptions={propertyTypeOptions2}
            ontologyFunctions={{ canEditResource: () => ({ allowed: true }) }}
            readonly
          />
        </Box>
      </Slide>
    </>
  );
};
