import { Button, TextField } from "@hashintel/hash-design-system/ui";
import {
  Box,
  Container,
  formHelperTextClasses,
  inputLabelClasses,
  outlinedInputClasses,
  Stack,
  Typography,
} from "@mui/material";
import { useRouter } from "next/router";
import { FormEvent, useState } from "react";
import { useBlockProtocolCreateEntityType } from "../../../../components/hooks/blockProtocolFunctions/ontology/useBlockProtocolCreateEntityType";
import { useLoggedInUser } from "../../../../components/hooks/useUser";
import { getPlainLayout, NextPageWithLayout } from "../../../../shared/layout";
import { TopContextBar } from "../../../shared/top-context-bar";
import { OntologyChip } from "../entity-type/ontology-chip";
import { PlaceholderIcon } from "../entity-type/placeholder-icon";

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

const HELPER_TEXT_WIDTH = 290;

const Page: NextPageWithLayout = () => {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const router = useRouter();
  const { user, loading } = useLoggedInUser({
    onCompleted(data) {
      if (typeof window !== "undefined") {
        void router.replace(`/@${data.me.shortname}/types/new/entity-type`);
      }
    },
  });

  if (user && router.query["account-slug"] !== `@${user.shortname}`) {
    throw new Error("Workspaces not yet supported");
  }

  const { createEntityType } = useBlockProtocolCreateEntityType(
    // @todo should use routing URL?
    user?.accountId ?? ""
  );

  const [creating, setCreating] = useState(false);

  if (loading || !user) {
    return null;
  }

  const handleSubmit = async (evt: FormEvent) => {
    evt.preventDefault();

    if (!creating) {
      setCreating(true);

      try {
        const res = await createEntityType({
          data: {
            entityType: {
              title: name,
              // @todo make this not necessary
              pluralTitle: name,
              description,
              kind: "entityType",
              type: "object",
              properties: {},
            },
          },
        });
        const newUrl = res.data?.entityTypeId.replace(/v\/\d+/, "");

        if (newUrl) {
          await router.push(newUrl);
        }
      } catch (err) {
        setCreating(false);
        throw err;
      }
    }
  };
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
              icon={<PlaceholderIcon />}
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
          <Box py={8} component="form" onSubmit={handleSubmit}>
            <Stack
              alignItems="stretch"
              sx={(theme) => ({
                [`.${inputLabelClasses.asterisk}`]: {
                  color: theme.palette.blue[70],
                },

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
                label="Singular Name"
                name="name"
                type="text"
                placeholder="e.g. Stock Price"
                value={name}
                onChange={(evt) => setName(evt.target.value)}
                required
                helperText={
                  <Box pr={1.25}>
                    <RequiredText /> - provide the singular form of your entity
                    type’s name so it can be referred to correctly (e.g. “Stock
                    Price” not “Stock Prices”)
                  </Box>
                }
              />
              <TextField
                multiline
                inputProps={{ minRows: 1 }}
                label="Description"
                name="description"
                type="text"
                placeholder="Describe this entity in one or two sentences"
                value={description}
                onChange={(evt) => setDescription(evt.target.value)}
                required
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
                  loading={creating}
                  loadingWithoutText
                >
                  Create new entity type
                </Button>
                {/** @todo set correct URL */}
                <Button href="/" variant="tertiary" size="small">
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
