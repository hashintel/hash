import { FormEvent, useState } from "react";

import { useRouter } from "next/router";

import { useMutation } from "@apollo/client";
import { tw } from "twind";

import { Collapse, Typography } from "@mui/material";
import { createEntityTypeMutation } from "../../../graphql/queries/entityType.queries";
import {
  CreateEntityTypeMutation,
  CreateEntityTypeMutationVariables,
} from "../../../graphql/apiTypes.gen";
import { Button, TextField } from "../../../shared/ui";
import {
  NextPageWithLayout,
  getLayoutWithSidebar,
} from "../../../shared/layout";
import { getAccountEntityTypes } from "../../../graphql/queries/account.queries";
import { useRouteAccountInfo } from "../../../shared/routing";

const Page: NextPageWithLayout = () => {
  const router = useRouter();
  const { accountId } = useRouteAccountInfo();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const [createEntityType, { loading, error }] = useMutation<
    CreateEntityTypeMutation,
    CreateEntityTypeMutationVariables
  >(createEntityTypeMutation, {
    onCompleted: ({ createEntityType: entityType }) =>
      router.push(`/${entityType.accountId}/types/${entityType.entityId}`),
    refetchQueries: [
      { query: getAccountEntityTypes, variables: { accountId } },
    ],
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    createEntityType({ variables: { description, name, accountId } }).catch(
      (err) => {
        // eslint-disable-next-line no-console -- TODO: consider using logger
        console.error("Could not create EntityType: ", err);
      },
    );
  };

  console.log("error => ", error?.message);

  return (
    <>
      <header className={tw`mb-12`}>
        <h1>
          Create new <strong>entity type</strong>
        </h1>
        <p>
          Entity types (sometimes called ‘schemas’) are used to define entities.
          Use them to add new custom entities to your graph.
        </p>
      </header>
      <section>
        <form onSubmit={submit}>
          <div className={tw`max-w-2xl lg:(flex)`}>
            <TextField
              label="Name"
              onChange={(evt) => setName(evt.target.value.replace(/\W/g, ""))}
              value={name}
              sx={{ marginRight: 2, flex: 1 }}
              size="large"
              helperText="Name should be in PasalCase"
              required
            />
            <TextField
              label="Description"
              onChange={(evt) => setDescription(evt.target.value)}
              value={description}
              size="large"
              sx={{ flex: 1.2 }}
            />
          </div>

          <div className={tw`mt-8`}>
            <Collapse in={!!error?.message}>
              <Typography
                sx={({ palette }) => ({
                  color: palette.orange[60],
                  mb: 1,
                  display: "block",
                })}
                variant="smallTextParagraphs"
              >
                {error?.message}
              </Typography>
            </Collapse>
            <Button loading={loading} disabled={loading} type="submit">
              Create Entity Type
            </Button>
          </div>
        </form>
      </section>
    </>
  );
};

Page.getLayout = getLayoutWithSidebar;

export default Page;
