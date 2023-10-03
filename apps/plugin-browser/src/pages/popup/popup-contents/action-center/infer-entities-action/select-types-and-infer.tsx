import { EntityType, VersionedUrl } from "@blockprotocol/graph";
import { Autocomplete, Button, Chip, MenuItem } from "@hashintel/design-system";
import { ProposedEntity } from "@local/hash-graphql-shared/graphql/api-types.gen";
import { EntityTypeRootType, Subgraph } from "@local/hash-subgraph";
import { getRoots } from "@local/hash-subgraph/stdlib";
import { Box, outlinedInputClasses, Skeleton, Typography } from "@mui/material";
import { useEffect, useState } from "react";
import browser, { Tabs } from "webextension-polyfill";

import { Message } from "../../../../../shared/messages";
import { queryApi } from "../../../../shared/query-api";

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
    $textInput: String!
    $entityTypeIds: [VersionedUrl!]!
  ) {
    inferEntities(
      allowEmptyResults: false
      entityTypeIds: $entityTypeIds
      maxTokens: 0
      model: "gpt-4-0613"
      temperature: 0
      textInput: $textInput
      validation: PARTIAL
    ) {
      entities {
        entityId
        entityTypeId
        properties
        linkData {
          leftEntityId
          rightEntityId
        }
      }
    }
  }
`;

const inferEntities = (textInput: string, entityTypeIds: VersionedUrl[]) => {
  return queryApi(inferEntitiesQuery, {
    entityTypeIds,
    textInput: textInput.slice(0, 7900),
  }).then(
    ({ data }: { data: { inferEntities: { entities: ProposedEntity[] } } }) => {
      return data.inferEntities.entities;
    },
  );
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

type SelectTypesAndInferProps = {
  activeTab?: Tabs.Tab | null;
  setInferredEntities: (entities: ProposedEntity[]) => void;
  setTargetEntityTypes: (types: EntityType[]) => void;
  targetEntityTypes: EntityType[];
};

export const SelectTypesAndInfer = ({
  activeTab,
  setInferredEntities,
  setTargetEntityTypes,
  targetEntityTypes,
}: SelectTypesAndInferProps) => {
  const [allEntityTypes, setAllEntityTypes] = useState<EntityType[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
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

  const inferEntitiesFromPage = async () => {
    if (!activeTab?.id) {
      throw new Error("No active tab");
    }

    const message: Message = {
      type: "get-site-content",
    };

    const siteContent = await (browser.tabs.sendMessage(
      activeTab.id,
      message,
    ) as Promise<string>);

    try {
      setLoading(true);
      const proposedEntitiesFromApi = await inferEntities(
        siteContent,
        targetEntityTypes.map((type) => type.$id),
      );

      setInferredEntities(proposedEntitiesFromApi);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`Couldn't infer entities: ${(err as Error).message}`);
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box
      component="form"
      onSubmit={(event) => {
        event.preventDefault();
        void inferEntitiesFromPage();
      }}
    >
      {error ? (
        <Typography
          sx={{ color: ({ palette }) => palette.error.main, fontSize: 14 }}
        >
          {error}
        </Typography>
      ) : loading ? (
        <Skeleton variant="rectangular" height={54} sx={{ borderRadius: 1 }} />
      ) : (
        <Autocomplete
          autoFocus={false}
          componentsProps={{
            paper: {
              sx: {
                p: 0,
              },
            },
            popper: { placement: "top" },
          }}
          getOptionLabel={(option) => `${option.title}-${option.$id}`}
          height="auto"
          inputProps={{
            endAdornment: <div />,
            placeholder: "Search for types...",
            sx: ({ palette }) => ({
              height: "auto",
              "@media (prefers-color-scheme: dark)": {
                background: "#161616",

                [`.${outlinedInputClasses.notchedOutline}`]: {
                  border: `1px solid ${palette.gray[90]} !important`,
                },

                [`.${outlinedInputClasses.input}`]: {
                  color: palette.gray[30],

                  "&::placeholder": {
                    color: `${palette.gray[60]} !important`,
                  },
                },
              },
            }),
          }}
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
      )}
      {error ? (
        <Button
          onClick={(event) => {
            event.preventDefault();
            setError("");
          }}
          type="button"
          sx={{ mt: 1.5 }}
        >
          Understood
        </Button>
      ) : (
        <Button
          disabled={loading || targetEntityTypes.length < 1}
          size="small"
          type="submit"
          sx={{ mt: 1.5 }}
        >
          {loading ? "Loading..." : "Suggest entities"}
        </Button>
      )}
    </Box>
  );
};
