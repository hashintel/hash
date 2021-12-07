import { useCallback, useState, VoidFunctionComponent } from "react";

import { CreatePage } from "./CreatePage";
import { Button } from "../../forms/Button";

type CreatePageButtonProps = {
  accountId: string;
};

export const CreatePageButton: VoidFunctionComponent<CreatePageButtonProps> = ({
  accountId,
}) => {
  const [showCreatePage, setShowCreatePage] = useState(false);

  const close = useCallback(() => {
    // Prevent the bug of closing a non-existing modal
    if (showCreatePage) {
      setShowCreatePage(false);
    }
  }, [showCreatePage]);

  return (
    <>
      {showCreatePage && <CreatePage close={close} accountId={accountId} />}

      <Button onClick={() => setShowCreatePage(true)}>Create page</Button>
    </>
  );
};
