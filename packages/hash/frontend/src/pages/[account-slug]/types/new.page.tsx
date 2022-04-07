import { FormEvent, useState } from "react";

import { useRouter } from "next/router";

import { useMutation } from "@apollo/client";
import { tw } from "twind";

import { createEntityTypeMutation } from "../../../graphql/queries/entityType.queries";
import {
  CreateEntityTypeMutation,
  CreateEntityTypeMutationVariables,
} from "../../../graphql/apiTypes.gen";
import { TextInput } from "../../../components/forms/TextInput";
import { Button } from "../../../shared/ui";
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
  const [loading, setLoading] = useState(false);

  const [createEntityType] = useMutation<
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
    setLoading(true);
    createEntityType({ variables: { description, name, accountId } }).catch(
      (err) => {
        setLoading(false);

        // eslint-disable-next-line no-console -- TODO: consider using logger
        console.error("Could not create EntityType: ", err);
      },
    );
  };

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
          <div className={tw`max-w-2xl lg:(flex justify-between) mb-8`}>
            <TextInput
              className={tw`w-full mb-6 lg:(mb-0 w-72)`}
              disallowRegExp={/\W/g}
              label="Name"
              onChangeText={setName}
              value={name}
            />
            <TextInput
              className={tw`w-full lg:w-72 mb-2`}
              label="Description"
              onChangeText={setDescription}
              value={description}
            />
          </div>
          <div>
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
