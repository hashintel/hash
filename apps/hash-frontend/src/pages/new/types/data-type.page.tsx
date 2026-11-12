import { useRouter } from "next/router";

import { validateVersionedUrl } from "@blockprotocol/type-system";

import { generateLinkParameters } from "../../../shared/generate-link-parameters";
import { getLayoutWithSidebar } from "../../../shared/layout";
import { PageDataTypeForm } from "../../shared/data-type";
import { NewTypePageContainer } from "./shared/new-type-page-container";

import type { NextPageWithLayout } from "../../../shared/layout";
import type { VersionedUrl } from "@blockprotocol/type-system";

const Page: NextPageWithLayout = () => {
  const router = useRouter();

  const extendsParam =
    typeof router.query.extends === "string" ? router.query.extends : undefined;
  const initialExtendsDataTypeId =
    extendsParam && validateVersionedUrl(extendsParam).type === "Ok"
      ? (extendsParam as VersionedUrl)
      : undefined;
  const initialTitle =
    typeof router.query.name === "string" ? router.query.name : undefined;

  return (
    <NewTypePageContainer
      kind="data"
      form={
        <PageDataTypeForm
          // Remount to reset the form when the seeded values change
          key={`${initialTitle ?? ""}-${initialExtendsDataTypeId ?? ""}`}
          editedDataType={null}
          initialTitle={initialTitle}
          initialExtendsDataTypeId={initialExtendsDataTypeId}
          onClose={() => {
            void router.push("/types/data-type");
          }}
          onSaved={(created) => {
            void router.push(generateLinkParameters(created.schema.$id).href);
          }}
        />
      }
    />
  );
};

Page.getLayout = (page) =>
  getLayoutWithSidebar(page, {
    fullWidth: true,
  });

export default Page;
