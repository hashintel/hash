import { EntityType } from "@blockprotocol/type-system-web";
import { Button, TextField } from "@hashintel/hash-design-system/ui";
import { generateTypeId, slugifyTypeTitle } from "@hashintel/hash-shared/types";
import {
  Box,
  Container,
  formHelperTextClasses,
  outlinedInputClasses,
  Stack,
  Typography,
} from "@mui/material";
import { Buffer } from "buffer/";
import { useRouter } from "next/router";
import { useForm } from "react-hook-form";
import { useBlockProtocolGetEntityType } from "../../../../components/hooks/blockProtocolFunctions/ontology/useBlockProtocolGetEntityType";
import { useLoggedInUser } from "../../../../components/hooks/useUser";
import { FRONTEND_URL } from "../../../../lib/config";
import { useInitTypeSystem } from "../../../../lib/use-init-type-system";
import { getPlainLayout, NextPageWithLayout } from "../../../../shared/layout";
import { TopContextBar } from "../../../shared/top-context-bar";
import { HashOntologyIcon } from "../entity-type/hash-ontology-icon";
import { OntologyChip } from "../entity-type/ontology-chip";

const RequiredText = () => (
  <Box
    component="span"
    color={(theme) => theme.palette.blue[70]}
    display="inline"
    fontWeight="bold"
  >
    Required
  </Box>
);

type CreateEntityTypeFormData = {
  name: string;
  description: string;
};

const HELPER_TEXT_WIDTH = 290;

const Page: NextPageWithLayout = () => {
  const typeSystemLoading = useInitTypeSystem();

  const {
    handleSubmit,
    register,
    formState: { isSubmitting },
  } = useForm<CreateEntityTypeFormData>();

  const router = useRouter();
  const { user, loading } = useLoggedInUser({
    onCompleted(data) {
      if (typeof window !== "undefined") {
        void router.replace(`/@${data.me.shortname}/types/new/entity-type`);
      }
    },
  });
  const { getEntityType } = useBlockProtocolGetEntityType();

  if (user && router.query["account-slug"] !== `@${user.shortname}`) {
    throw new Error("Workspaces not yet supported");
  }

  if (typeSystemLoading || loading || !user) {
    return null;
  }

  const handleFormSubmit = handleSubmit(async ({ name, description }) => {
    if (!user.shortname) {
      throw new Error("Namespace for entity type creation missing");
    }

    const url = `${FRONTEND_URL}/@${
      user.shortname
    }/types/entity-type/${slugifyTypeTitle(name)}`;

    const entityTypeId = generateTypeId({
      domain: FRONTEND_URL,
      kind: "entity-type",
      title: name,
      namespace: user.shortname,
    });

    const res = await getEntityType({ data: { entityTypeId } });

    if (res.data?.roots.length) {
      // @todo handle this
      throw new Error("Type already exists");
    }

    const entityType: EntityType = {
      title: name,
      // @todo make this not necessary
      pluralTitle: name,
      description,
      kind: "entityType",
      type: "object",
      properties: {},
      $id: `${url}/v/1`,
    };

    // @todo ensure this matches the slug algorithm used by backend
    // @todo ensure this is unique
    const nextUrl = `${url}?draft=${encodeURIComponent(
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
                    {router.query["account-slug"]}
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

                  [`&:not(.${formHelperTextClasses.focused})`]: {
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
                  disabled: isSubmitting,
                })}
                required
                disabled={isSubmitting}
                label="Singular Name"
                type="text"
                placeholder="e.g. Stock Price"
                helperText={
                  <Box pr={1.25}>
                    <RequiredText /> - provide the singular form of your entity
                    type’s name so it can be referred to correctly (e.g. “Stock
                    Price” not “Stock Prices”)
                  </Box>
                }
              />
              <TextField
                {...register("description", {
                  required: true,
                  disabled: isSubmitting,
                })}
                required
                disabled={isSubmitting}
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
                    <RequiredText /> - descriptions should explain what an
                    entity type is, and when they should be used
                  </Box>
                }
              />
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1.25}>
                <Button
                  type="submit"
                  size="small"
                  loading={isSubmitting}
                  disabled={isSubmitting}
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
