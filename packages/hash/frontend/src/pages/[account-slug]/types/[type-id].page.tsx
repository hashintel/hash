import { useCallback, useRef } from "react";
import pluralize from "pluralize";
import { useQuery } from "@apollo/client";
import { useRouter } from "next/router";

import { Box, styled } from "@mui/material";
import { faAsterisk } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@hashintel/hash-design-system";
import {
  DeprecatedGetEntityTypeQuery,
  DeprecatedGetEntityTypeQueryVariables,
} from "../../../graphql/apiTypes.gen";
import { deprecatedGetEntityTypeQuery } from "../../../graphql/queries/entityType.queries";
import {
  SchemaEditor,
  SchemaSelectElementType,
} from "../../../components/entityTypes/SchemaEditor/SchemaEditor";
import { AccountEntityOfTypeList } from "../../../components/entityTypes/AccountEntityOfTypeList";
import { useBlockProtocolUpdateEntityType } from "../../../components/hooks/blockProtocolFunctions/useBlockProtocolUpdateEntityType";
import { useBlockProtocolAggregateEntityTypes } from "../../../components/hooks/blockProtocolFunctions/useBlockProtocolAggregateEntityTypes";
import {
  getLayoutWithSidebar,
  NextPageWithLayout,
} from "../../../shared/layout";
import { Button, Link } from "../../../shared/ui";
import { useRouteAccountInfo } from "../../../shared/routing";
import {
  TopContextBar,
  TOP_CONTEXT_BAR_HEIGHT,
} from "../../shared/top-context-bar";
import { HEADER_HEIGHT } from "../../../shared/layout/layout-with-header/page-header";

const Container = styled("div")(({ theme }) => ({
  display: "grid",
  gridTemplateColumns: "1fr minmax(65ch, 1200px) 1fr",
  padding: theme.spacing(7, 10),

  "& > *": {
    gridColumn: "2",
  },
}));

const Page: NextPageWithLayout = () => {
  const router = useRouter();
  const { query } = router;

  const typeId = query["type-id"] as string;
  const { accountId } = useRouteAccountInfo();

  const { updateEntityType } = useBlockProtocolUpdateEntityType();
  const { aggregateEntityTypes } =
    useBlockProtocolAggregateEntityTypes(accountId);
  const pageHeaderRef = useRef<HTMLElement>();

  /** @see https://json-schema.org/understanding-json-schema/structuring.html#json-pointer */
  const subSchemaReference =
    typeof window !== "undefined"
      ? decodeURIComponent(window.location.hash)
      : undefined;

  const { data } = useQuery<
    DeprecatedGetEntityTypeQuery,
    DeprecatedGetEntityTypeQueryVariables
  >(deprecatedGetEntityTypeQuery, {
    variables: { entityTypeId: typeId },
    pollInterval: 5000,
  });

  const schema = data?.deprecatedGetEntityType.properties;

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
        <Link noLinkStyle href={schemaLinkPath}>
          <a>
            <strong>{schemaRef.replace(/#\/\$defs\//g, "")}</strong>
          </a>
        </Link>
      );
    },
    [schema$id, subSchemaReference],
  );

  const scrollToTop = () => {
    if (!pageHeaderRef.current) return;
    pageHeaderRef.current.scrollIntoView({
      behavior: "smooth",
    });
  };

  const crumbs = !schema
    ? []
    : [
        {
          title: schema.title,
          href: `/${accountId}/types/${typeId}`,
          id: typeId,
        },
      ];

  if (!data) {
    return (
      <Container>
        <h1>Loading...</h1>
      </Container>
    );
  }

  return (
    <>
      <Box
        sx={({ zIndex, palette }) => ({
          position: "sticky",
          top: 0,
          zIndex: zIndex.appBar,
          backgroundColor: palette.white,
        })}
      >
        <TopContextBar
          crumbs={crumbs}
          defaultCrumbIcon={<FontAwesomeIcon icon={faAsterisk} />}
          scrollToTop={scrollToTop}
        />
      </Box>
      <Container>
        <Box
          ref={pageHeaderRef}
          sx={{
            mb: 6,
            scrollMarginTop: HEADER_HEIGHT + TOP_CONTEXT_BAR_HEIGHT,
          }}
        >
          <Box
            sx={{
              mb: 4,
            }}
          >
            <h1>
              <strong>{pluralize(schema.title)} in account</strong>
            </h1>
            <AccountEntityOfTypeList
              accountId={accountId}
              entityTypeId={typeId}
            />
          </Box>

          <Button href={`/${accountId}/entities/new?entityTypeId=${typeId}`}>
            New {schema.title}
          </Button>
        </Box>
        <SchemaEditor
          aggregateEntityTypes={aggregateEntityTypes}
          entityTypeId={data.deprecatedGetEntityType.entityId}
          schema={schema}
          GoToSchemaElement={schemaSelectElement}
          subSchemaReference={subSchemaReference}
          updateEntityType={updateEntityType}
        />
      </Container>
    </>
  );
};

Page.getLayout = (page) =>
  getLayoutWithSidebar(page, {
    fullWidth: true,
  });

export default Page;
