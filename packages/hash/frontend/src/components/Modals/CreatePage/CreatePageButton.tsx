import { useState, VoidFunctionComponent } from "react";

import { CreatePage } from "../../Modals/CreatePage/CreatePage";

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

      <button className="button" onClick={() => setShowCreatePage(true)}>
        Create page
      </button>
    </>
  );
};
