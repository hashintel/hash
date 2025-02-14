import type { VersionedUrl } from "@blockprotocol/type-system/slim";
import { useRouter } from "next/router";

import type { NextPageWithLayout } from "../../../shared/layout";
import { getLayoutWithSidebar } from "../../../shared/layout";
import { CreateDataTypeForm } from "../../shared/create-data-type-form";
import { NewTypePageContainer } from "./shared/new-type-page-container";

const Page: NextPageWithLayout = () => {
  const router = useRouter();

  const initialData = {
    extendsDataTypeId:
      typeof router.query.extends === "string"
        ? (router.query.extends as VersionedUrl)
        : undefined,
    title:
      typeof router.query.name === "string" ? router.query.name : undefined,
  };

  return (
    <NewTypePageContainer
      form={
        <CreateDataTypeForm
          key={JSON.stringify(initialData)} // re-render the form to reset state when the initial data changes
          initialData={initialData}
          onCancel={() => router.push("/")}
        />
      }
      kind="data"
    />
  );
};

Page.getLayout = (page) =>
  getLayoutWithSidebar(page, {
    fullWidth: true,
  });

export default Page;
