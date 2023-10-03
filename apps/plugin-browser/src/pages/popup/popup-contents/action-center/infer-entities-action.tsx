import { EntityType, VersionedUrl } from "@blockprotocol/graph";
import { Autocomplete, Button, Chip, MenuItem } from "@hashintel/design-system";
import { Entity, EntityTypeRootType, Subgraph } from "@local/hash-subgraph";
import { getRoots } from "@local/hash-subgraph/stdlib";
import { Box, Tooltip, Typography } from "@mui/material";
import { useEffect, useState } from "react";
import browser, { Tabs } from "webextension-polyfill";

import { Message } from "../../../../shared/messages";
import { queryApi } from "../../../shared/query-api";
import { Action } from "./action";
import { CreateEntityIcon } from "./infer-entities-action/create-entity-icon";

const getEntityTypesQuery = /* GraphQL */ `
  query getEntityTypes {
    queryEntityTypes(
      constrainsValuesOn: { outgoing: 0 }
      constrainsPropertiesOn: { outgoing: 0 }
      constrainsLinksOn: { outgoing: 0 }
      constrainsLinkDestinationsOn: { outgoing: 0 }
      inheritsFrom: { outgoing: 0 }
      latestOnly: true
      includeArchived: false
    ) {
      roots
      vertices
    }
  }
`;

const getEntityTypes = () => {
  return queryApi(getEntityTypesQuery).then(
    ({
      data,
    }: {
      data: { queryEntityTypes: Subgraph<EntityTypeRootType> };
    }) => {
      const subgraph = data.queryEntityTypes;
      return getRoots(subgraph).map(
        (typeWithMetadata) => typeWithMetadata.schema,
      );
    },
  );
};

const inferEntitiesQuery = /* GraphQL */ `
  mutation inferEntities(
    
  ) {
    inferEntities(
      
    )
  }
`;

const inferEntities = (text: string, targetTypeIds: VersionedUrl[]) => {
  return queryApi(inferEntitiesQuery, {
    entityTypeId:
      "https://app.hash.ai/@ciaran/types/entity-type/quick-note/v/1",
    properties: {
      "https://blockprotocol.org/@blockprotocol/types/property-type/textual-content/":
        text,
    },
  }).then(({ data }: { data: { inferEntities: Subgraph } }) => {
    return data.inferEntities;
  });
};

// This assumes a VersionedURL in the hash.ai/blockprotocol.org format
const getChipLabelFromId = (id: VersionedUrl) => {
  const url = new URL(id);
  const [_emptyString, namespace, _types, _entityType, typeSlug] =
    url.pathname.split("/");

  return `${
    url.origin !== FRONTEND_ORIGIN ? `${url.host} / ` : ""
  }${namespace} / ${typeSlug}`;
};

export const InferEntitiesAction = ({
  activeTab,
}: {
  activeTab?: Tabs.Tab;
}) => {
  const [allEntityTypes, setAllEntityTypes] = useState<EntityType[]>([]);
  const [entitiesToCreate, setEntitiesToCreate] = useState<Entity[]>([]);
  const [inferredEntities, setInferredEntities] = useState("");
  const [targetEntityTypes, setTargetEntityTypes] = useState<EntityType[]>([]);
  const [selectOpen, setSelectOpen] = useState(false);

  useEffect(() => {
    // Preload from storage, in case we already loaded them
    void browser.storage.session.get("entityTypes").then((result) => {
      setAllEntityTypes((result.entityTypes as EntityType[] | undefined) ?? []);
    });

    void getEntityTypes().then((entityTypes) => {
      setAllEntityTypes(
        entityTypes.sort((a, b) => a.title.localeCompare(b.title)),
      );
      void browser.storage.session.set({ entityTypes });
    });
  }, []);

  const requestSiteContent = async () => {
    if (!activeTab?.id) {
      throw new Error("No active tab");
    }

    const message: Message = {
      type: "get-site-content",
    };

    return browser.tabs.sendMessage(activeTab.id, message) as Promise<string>;
  };

  const inferEntitiesFromPage = async () => {
    const siteContent = await requestSiteContent();

    const inferredEntities = await inferEntities(siteContent);

    inferEntities().then(console.log);
  };

  return (
    <Action
      HeaderIcon={CreateEntityIcon}
      headerText="Create entities from page"
      linkHref="https://app.hash.ai/@ciaran/types/entity-type/quick-note?tab=entities"
      linkText="View entities"
    >
      <Box
        component="form"
        onSubmit={(event) => {
          event.preventDefault();
          inferEntitiesFromPage();
        }}
      >
        <Autocomplete
          componentsProps={{
            paper: { sx: { p: 0 } },
            popper: { placement: "top" },
          }}
          getOptionLabel={(option) => `${option.title}-${option.$id}`}
          height="auto"
          inputProps={{ endAdornment: <div />, sx: { height: "auto" } }}
          ListboxProps={{
            sx: {
              maxHeight: 240,
            },
          }}
          modifiers={[
            {
              name: "flip",
              enabled: false,
            },
          ]}
          multiple
          open={selectOpen}
          onChange={(_event, value) => {
            setTargetEntityTypes(value);
            setSelectOpen(false);
          }}
          onClose={() => setSelectOpen(false)}
          onOpen={() => setSelectOpen(true)}
          options={allEntityTypes}
          renderOption={(props, type) => (
            <MenuItem
              {...props}
              key={type.$id}
              value={type.$id}
              sx={{
                minHeight: 0,
                borderBottom: ({ palette }) => `1px solid ${palette.gray[20]}`,
              }}
            >
              <Typography sx={{ fontSize: 14 }}>{type.title}</Typography>
              <Chip
                color="blue"
                label={getChipLabelFromId(type.$id)}
                sx={{ ml: 1, fontSize: 13 }}
              />
            </MenuItem>
          )}
          renderTags={(value, getTagProps) =>
            value.map((option, index) => (
              <Chip
                {...getTagProps({ index })}
                key={option.$id}
                variant="outlined"
                label={option.title}
              />
            ))
          }
          value={targetEntityTypes}
        />
        {inferredEntities ? (
          <Button
            disabled={targetEntityTypes.length < 1}
            size="small"
            type="submit"
            sx={{ mt: 1.5 }}
          >
            Create entities
          </Button>
        ) : (
          <Button
            disabled={targetEntityTypes.length < 1}
            size="small"
            type="submit"
            sx={{ mt: 1.5 }}
          >
            Suggest entities
          </Button>
        )}
      </Box>
    </Action>
  );
};
