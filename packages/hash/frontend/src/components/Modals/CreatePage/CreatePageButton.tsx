import { useState, VoidFunctionComponent } from "react";

import { CreatePage } from "../../Modals/CreatePage/CreatePage";

type CreatePageButtonProps = {
  namespaceId: string;
};

export const CreatePageButton: VoidFunctionComponent<CreatePageButtonProps> = ({
  namespaceId,
}) => {
  const [showCreatePage, setShowCreatePage] = useState(false);

  return (
    <>
      <CreatePage
        close={() => setShowCreatePage(false)}
        namespaceId={namespaceId}
        show={showCreatePage}
      />

      <button className="button" onClick={() => setShowCreatePage(true)}>
        Create page
      </button>
    </>
  );
};
