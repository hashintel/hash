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
      {showCreatePage && (
        <CreatePage
          close={() => {
            if (showCreatePage) {
              setShowCreatePage(false);
            }
          }}
          accountId={accountId}
        />
      )}

      <Button onClick={() => setShowCreatePage(true)}>Create page</Button>
    </>
  );
};
