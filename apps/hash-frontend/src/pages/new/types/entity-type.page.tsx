import type { VersionedUrl } from "@blockprotocol/type-system";
import { blockProtocolEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import { useRouter } from "next/router";
import { useContext } from "react";

import type { NextPageWithLayout } from "../../../shared/layout";
import { getLayoutWithSidebar } from "../../../shared/layout";
import { CreateEntityTypeForm } from "../../shared/create-entity-type-form";
import { WorkspaceContext } from "../../shared/workspace-context";
import { NewTypePageContainer } from "./shared/new-type-page-container";

const Page: NextPageWithLayout = () => {
  const router = useRouter();

  const { activeWorkspace } = useContext(WorkspaceContext);

  if (!activeWorkspace) {
    return null;
  }

  const initialData = {
    extendsEntityTypeId:
      typeof router.query.extends === "string"
        ? (router.query.extends as VersionedUrl)
        : undefined,
    title:
      typeof router.query.name === "string" ? router.query.name : undefined,
  };

  const isCreateLinkEntityType =
    initialData.extendsEntityTypeId ===
    blockProtocolEntityTypes.link.entityTypeId;

  return (
    <NewTypePageContainer
      form={
        <CreateEntityTypeForm
          key={JSON.stringify(initialData)} // re-render the form to reset state when the initial data changes
          initialData={initialData}
          isLink={isCreateLinkEntityType}
          onCancel={() => router.push("/")}
        />
      }
      kind={isCreateLinkEntityType ? "link" : "entity"}
    />
  );
};

Page.getLayout = (page) =>
  getLayoutWithSidebar(page, {
    fullWidth: true,
  });

export default Page;
