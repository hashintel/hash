import { extractBaseUri } from "@blockprotocol/type-system";
import { NextPageWithLayout } from "../shared/layout";

const TestPage: NextPageWithLayout = () => {
  return (
    <h1>
      {extractBaseUri("http://localhost:300/@alice/types/entity-type/foo/v/1")}
    </h1>
  );
};

export default TestPage;
