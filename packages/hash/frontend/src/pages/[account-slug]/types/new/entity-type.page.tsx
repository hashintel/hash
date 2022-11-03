import { EntityType } from "@blockprotocol/type-system-web";
import { Button, TextField } from "@hashintel/hash-design-system/ui";
import {
  addVersionToBaseUri,
  generateBaseTypeId,
} from "@hashintel/hash-shared/types";
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
import { Buffer } from "buffer/";
import { useRouter } from "next/router";
import { ReactNode, useEffect } from "react";
import { useForm } from "react-hook-form";
import { useBlockProtocolGetEntityType } from "../../../../components/hooks/blockProtocolFunctions/ontology/useBlockProtocolGetEntityType";
import { useAuthenticatedUser } from "../../../../components/hooks/useAuthenticatedUser";
import { FRONTEND_URL } from "../../../../lib/config";
import { useInitTypeSystem } from "../../../../lib/use-init-type-system";
import { getPlainLayout, NextPageWithLayout } from "../../../../shared/layout";
import { TopContextBar } from "../../../shared/top-context-bar";
import { HashOntologyIcon } from "../entity-type/hash-ontology-icon";
import { OntologyChip } from "../entity-type/ontology-chip";
import { useRouteNamespace } from "../entity-type/use-route-namespace";

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
  addVersionToBaseUri(baseUri, 1);

const Page: NextPageWithLayout = () => {
  const typeSystemLoading = useInitTypeSystem();

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
  });

  const router = useRouter();
  const { authenticatedUser, loading } = useAuthenticatedUser();
  const { getEntityType } = useBlockProtocolGetEntityType();
  const namespace = useRouteNamespace();

  useEffect(() => {
    if (authenticatedUser && !namespace) {
      void router.replace(
        `/@${authenticatedUser.shortname}/types/new/entity-type`,
      );
    }
  }, [authenticatedUser, namespace, router]);

  if (typeSystemLoading || loading || !authenticatedUser || !namespace) {
    return null;
  }

  const generateEntityTypeBaseUriForUser = (value: string) => {
    if (!namespace) {
      throw new Error("User or Org shortname must exist");
    }

    return generateBaseTypeId({
      domain: FRONTEND_URL,
      namespace: namespace.shortname ?? "",
      kind: "entity-type",
      title: value,
    });
  };

  const handleFormSubmit = handleSubmit(async ({ name, description }) => {
    if (!namespace) {
      throw new Error("Namespace for entity type creation missing");
    }

    const baseUri = generateEntityTypeBaseUriForUser(name);
    const entityType: EntityType = {
      title: name,
      // @todo make this not necessary
      pluralTitle: name,
      description,
      kind: "entityType",
      type: "object",
      properties: {},
      $id: generateInitialEntityTypeId(baseUri),
    };

    const nextUrl = `${baseUri}?draft=${encodeURIComponent(
      Buffer.from(JSON.stringify(entityType)).toString("base64"),
    )}`;

    await router.push(nextUrl, nextUrl, { shallow: true });
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
              icon={<HashOntologyIcon />}
              domain="hash.ai"
              path={
                <Typography color={(theme) => theme.palette.blue[70]}>
                  <Typography
                    component="span"
                    fontWeight="bold"
                    color="inherit"
                  >
                    {`@${namespace.shortname}`}
                  </Typography>
                  /types/new/entity-type
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
          <Box py={8} component="form" onSubmit={handleFormSubmit}>
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
                {/** @todo set correct URL */}
                <Button
                  href="/"
                  variant="tertiary"
                  size="small"
                  disabled={isSubmitting}
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

Page.getLayout = getPlainLayout;

export default Page;
