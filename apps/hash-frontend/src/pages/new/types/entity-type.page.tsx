import { EntityType } from "@blockprotocol/type-system";
import {
  Button,
  OntologyChip,
  OntologyIcon,
  TextField,
} from "@hashintel/design-system";
import { frontendUrl } from "@local/hash-isomorphic-utils/environment";
import { generateBaseTypeId } from "@local/hash-isomorphic-utils/ontology-types";
import { versionedUriFromComponents } from "@local/hash-subgraph/src/shared/type-system-patch";
import {
  Box,
  Container,
  formHelperTextClasses,
  outlinedInputClasses,
  Stack,
  SxProps,
  Theme,
  Typography,
} from "@mui/material";
// eslint-disable-next-line unicorn/prefer-node-protocol -- https://github.com/sindresorhus/eslint-plugin-unicorn/issues/1931#issuecomment-1359324528
import { Buffer } from "buffer/";
import { useRouter } from "next/router";
import { ReactNode, useContext } from "react";
import { useForm } from "react-hook-form";

import { useBlockProtocolGetEntityType } from "../../../components/hooks/block-protocol-functions/ontology/use-block-protocol-get-entity-type";
import {
  getLayoutWithSidebar,
  NextPageWithLayout,
} from "../../../shared/layout";
import { Link } from "../../../shared/ui/link";
import { TopContextBar } from "../../shared/top-context-bar";
import { WorkspaceContext } from "../../shared/workspace-context";

const FormHelperLabel = ({
  children,
  sx,
}: {
  children: ReactNode;
  sx?: SxProps<Theme>;
}) => (
  <Box
    component="span"
    color={(theme) => theme.palette.blue[70]}
    display="inline"
    fontWeight="bold"
    sx={sx}
  >
    {children}
  </Box>
);

type CreateEntityTypeFormData = {
  name: string;
  description: string;
};

const HELPER_TEXT_WIDTH = 290;

const generateInitialEntityTypeId = (baseUri: string) =>
  versionedUriFromComponents(baseUri, 1);

/**
 * @todo check user has permission to create entity type in this namespace
 */
const Page: NextPageWithLayout = () => {
  const router = useRouter();

  const {
    handleSubmit,
    register,
    formState: {
      isSubmitting,
      errors: { name: nameError },
    },
    clearErrors,
  } = useForm<CreateEntityTypeFormData>({
    shouldFocusError: true,
    mode: "onSubmit",
    reValidateMode: "onSubmit",
    defaultValues: {
      name: typeof router.query.name === "string" ? router.query.name : "",
    },
  });

  const { getEntityType } = useBlockProtocolGetEntityType();
  const { activeWorkspace } = useContext(WorkspaceContext);

  if (!activeWorkspace) {
    return null;
  }

  const generateEntityTypeBaseUriForUser = (value: string) => {
    if (!activeWorkspace.shortname) {
      throw new Error("User or Org shortname must exist");
    }

    return generateBaseTypeId({
      domain: frontendUrl,
      namespace: activeWorkspace.shortname,
      kind: "entity-type",
      title: value,
    });
  };

  const handleFormSubmit = handleSubmit(async ({ name, description }) => {
    const baseUri = generateEntityTypeBaseUriForUser(name);
    const entityType: EntityType = {
      title: name,
      description,
      kind: "entityType",
      type: "object",
      properties: {},
      $id: generateInitialEntityTypeId(baseUri),
    };

    const nextUrl = `${baseUri}?draft=${encodeURIComponent(
      Buffer.from(JSON.stringify(entityType)).toString("base64"),
    )}`;

    await router.push(nextUrl);
  });

  return (
    <Stack sx={{ height: "100vh" }}>
      <Box bgcolor="white">
        <TopContextBar
          defaultCrumbIcon={null}
          crumbs={[
            {
              title: "Types",
              href: "#",
              id: "types",
            },
            {
              title: "Entity types",
              href: "#",
              id: "entity-types",
            },
          ]}
          scrollToTop={() => {}}
        />
        <Box py={3.75}>
          <Container>
            <OntologyChip
              icon={<OntologyIcon />}
              domain="hash.ai"
              path={
                <Typography color={(theme) => theme.palette.blue[70]}>
                  <Typography
                    component="span"
                    fontWeight="bold"
                    color="inherit"
                  >
                    {`@${activeWorkspace.shortname}`}
                  </Typography>
                  /types/entity-type
                </Typography>
              }
              sx={[{ marginBottom: 2 }]}
            />
            <Typography variant="h1" fontWeight="bold">
              Create new entity type
            </Typography>
          </Container>
        </Box>
      </Box>
      <Box flex={1} bgcolor="gray.10" borderTop={1} borderColor="gray.20">
        <Container>
          <Box
            py={8}
            component="form"
            onSubmit={handleFormSubmit}
            data-testid="entity-type-creation-form"
          >
            <Stack
              alignItems="stretch"
              sx={(theme) => ({
                [theme.breakpoints.up("md")]: {
                  [`.${outlinedInputClasses.root}`]: {
                    width: `calc(100% - ${HELPER_TEXT_WIDTH + 52}px)`,
                  },
                },

                [`.${formHelperTextClasses.root}`]: {
                  position: "absolute",
                  right: 0,
                  top: 24,
                  width: HELPER_TEXT_WIDTH,
                  p: 0,
                  m: 0,
                  color: theme.palette.gray[80],

                  [`&:not(.${formHelperTextClasses.focused}):not(.${formHelperTextClasses.error})`]:
                    {
                      display: "none",
                    },

                  [theme.breakpoints.down("md")]: {
                    display: "none",
                  },
                },
              })}
              spacing={3}
            >
              <TextField
                {...register("name", {
                  required: true,
                  onChange() {
                    clearErrors("name");
                  },
                  async validate(value) {
                    const res = await getEntityType({
                      data: {
                        entityTypeId: generateInitialEntityTypeId(
                          generateEntityTypeBaseUriForUser(value),
                        ),
                        graphResolveDepths: {
                          constrainsValuesOn: { outgoing: 0 },
                          constrainsPropertiesOn: { outgoing: 0 },
                          constrainsLinksOn: { outgoing: 0 },
                          constrainsLinkDestinationsOn: { outgoing: 0 },
                        },
                      },
                    });

                    return res.data?.roots.length
                      ? "Entity type name must be unique"
                      : true;
                  },
                })}
                required
                label="Singular Name"
                type="text"
                placeholder="e.g. Stock Price"
                helperText={
                  <Box pr={1.25}>
                    {nameError?.message ? (
                      <>
                        <FormHelperLabel
                          sx={(theme) => ({ color: theme.palette.red[70] })}
                        >
                          Error
                        </FormHelperLabel>{" "}
                        - {nameError.message}
                      </>
                    ) : (
                      <>
                        <FormHelperLabel>Required</FormHelperLabel> - provide
                        the singular form of your entity type’s name so it can
                        be referred to correctly (e.g. “Stock Price” not “Stock
                        Prices”)
                      </>
                    )}
                  </Box>
                }
                error={!!nameError}
              />
              <TextField
                {...register("description", {
                  required: true,
                })}
                required
                multiline
                onKeyDown={async (evt) => {
                  if (!isSubmitting && evt.key === "Enter" && evt.metaKey) {
                    await handleFormSubmit(evt);
                  }
                }}
                inputProps={{ minRows: 1 }}
                label="Description"
                type="text"
                placeholder="Describe this entity in one or two sentences"
                helperText={
                  <Box pr={3.75}>
                    <FormHelperLabel>Required</FormHelperLabel> - descriptions
                    should explain what an entity type is, and when they should
                    be used
                  </Box>
                }
              />
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1.25}>
                <Button
                  type="submit"
                  size="small"
                  loading={isSubmitting}
                  disabled={isSubmitting || !!nameError}
                  loadingWithoutText
                >
                  Create new entity type
                </Button>
                <Button
                  href="/"
                  variant="tertiary"
                  size="small"
                  disabled={isSubmitting}
                  // For some reason, Button doesn't know it can take component
                  {...({ component: Link } as any)}
                >
                  Discard draft
                </Button>
              </Stack>
            </Stack>
          </Box>
        </Container>
      </Box>
    </Stack>
  );
};

Page.getLayout = (page) =>
  getLayoutWithSidebar(page, {
    fullWidth: true,
  });

export default Page;
