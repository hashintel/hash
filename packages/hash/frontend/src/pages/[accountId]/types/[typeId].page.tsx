import { useCallback, VoidFunctionComponent } from "react";
import Link from "next/link";
import pluralize from "pluralize";
import { useQuery } from "@apollo/client";
import { useRouter } from "next/router";

import { tw } from "twind";
import { Button } from "../../../components/forms/Button";
import {
  GetEntityTypeQuery,
  GetEntityTypeQueryVariables,
} from "../../../graphql/apiTypes.gen";
import { getEntityTypeQuery } from "../../../graphql/queries/entityType.queries";
import {
  SchemaEditor,
  SchemaSelectElementType,
} from "../../../components/entityTypes/SchemaEditor/SchemaEditor";
import { AccountEntityOfTypeList } from "../../../components/entityTypes/AccountEntityOfTypeList";
import { useBlockProtocolUpdateEntityType } from "../../../components/hooks/blockProtocolFunctions/useBlockProtocolUpdateEntityType";
import { useBlockProtocolAggregateEntityTypes } from "../../../components/hooks/blockProtocolFunctions/useBlockProtocolAggregateEntityTypes";
import { MainContentWrapper } from "../../../components/layout/MainContentWrapper";

export const EntityType: VoidFunctionComponent = () => {
  const router = useRouter();
  const { query } = router;

  const typeId = query.typeId as string;
  const accountId = query.accountId as string;

  const { updateEntityTypes } = useBlockProtocolUpdateEntityType();
  const { aggregateEntityTypes } = useBlockProtocolAggregateEntityTypes();

  /** @see https://json-schema.org/understanding-json-schema/structuring.html#json-pointer */
  const subSchemaReference =
    typeof window !== "undefined"
      ? decodeURIComponent(window.location.hash)
      : undefined;

  const { data } = useQuery<GetEntityTypeQuery, GetEntityTypeQueryVariables>(
    getEntityTypeQuery,
    {
      variables: { entityTypeId: typeId },
      pollInterval: 5000,
    },
  );

  const schema = data?.getEntityType.properties;

  const schema$id: string = schema?.$id;

  /**
   * This element is for users to interact with to select other schemas. In this case, a <Link>.
   * It's kept above the editor to allow for other schema-loading approaches to be passed into the editor,
   * so that the editor doesn't need to be aware of how schemas are retrieved and loaded.
   */
  const schemaSelectElement = useCallback<SchemaSelectElementType>(
    ({ schemaRef }) => {
      const baseUrl = schema$id.startsWith("http")
        ? new URL(schema$id).origin
        : undefined;

      let schemaLinkPath = "";
      /**
       * @todo catch links to schemas served from outside HASH, and instead of opening their off-site pages,
       *    fetch them and load them into our viewer. Will need to update relative approaches too.
       */
      if (schemaRef.startsWith("#")) {
        /**
         * This is a relative link to a sub-schema of this same schema
         * @see https://json-schema.org/understanding-json-schema/structuring.html#json-pointer
         */
        schemaLinkPath = schema$id + schemaRef;
      } else if (schemaRef.startsWith("/")) {
        /**
         * This is a relative link to another schema to be resolved against the base URL of this schema.
         * @see https://json-schema.org/understanding-json-schema/structuring.html#ref
         */
        if (!baseUrl) {
          throw new Error(
            `Cannot resolve relative link ${schemaRef} against anonymous schema`,
          );
        }
        schemaLinkPath = baseUrl + schemaRef;
      } else if (schemaRef.startsWith("http")) {
        schemaLinkPath = schemaRef;
      } else {
        /**
         * This could be a property name for an object defined in the tree of the schema or a sub-schema within it.
         * Really these should instead be defined under $defs and referenced as such, but they might exist.
         */
        schemaLinkPath = `${
          schema$id + (subSchemaReference || "#")
        }/properties/${schemaRef}`;
      }

      return (
        <Link href={schemaLinkPath}>
          <a>
            <strong>{schemaRef.replace(/#\/\$defs\//g, "")}</strong>
          </a>
        </Link>
      );
    },
    [schema$id, subSchemaReference],
  );

  return (
    <MainContentWrapper>
      {!data ? (
        <h1>Loading...</h1>
      ) : (
        <>
          <div className={tw`mb-12`}>
            <div className={tw`mb-8`}>
              <h1>
                <strong>{pluralize(schema.title)} in account</strong>
              </h1>
              <AccountEntityOfTypeList
                accountId={accountId}
                entityTypeId={typeId}
              />
            </div>
            <Link href={`/${accountId}/entities/new?entityTypeId=${typeId}`}>
              <a>
                <Button>New {schema.title}</Button>
              </a>
            </Link>
          </div>
          <SchemaEditor
            accountId={accountId}
            aggregateEntityTypes={aggregateEntityTypes}
            entityId={data.getEntityType.entityId}
            schema={schema}
            GoToSchemaElement={schemaSelectElement}
            subSchemaReference={subSchemaReference}
            updateEntityTypes={updateEntityTypes}
          />
        </>
      )}
    </MainContentWrapper>
  );
};

export default EntityType;
