import { useState, VoidFunctionComponent } from "react";

import { CreatePage } from "./CreatePage";
import { Button } from "../../forms/Button";

type CreatePageButtonProps = {
  accountId: string;
};

export const CreatePageButton: VoidFunctionComponent<CreatePageButtonProps> = ({
  accountId,
}) => {
  const [showCreatePage, setShowCreatePage] = useState(false);

  return (
    <>
      <CreatePage
        close={() => setShowCreatePage(false)}
        accountId={accountId}
        show={showCreatePage}
      />

      <Button onClick={() => setShowCreatePage(true)}>Create page</Button>
    </>
  );
};
