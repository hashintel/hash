import { useCallback, useState, VFC } from "react";

import { faAdd } from "@fortawesome/free-solid-svg-icons";
import { Tooltip } from "@mui/material";
import { CreatePageModal } from "../../../Modals/CreatePageModal";
import { FontAwesomeIcon } from "../../../icons";
import { IconButton } from "../../../IconButton";

type CreatePageButtonProps = {
  accountId: string;
};

export const CreatePageButton: VFC<CreatePageButtonProps> = ({ accountId }) => {
  const [showCreatePage, setShowCreatePage] = useState(false);

  const close = useCallback(() => {
    // Prevent the bug of closing a non-existing modal
    if (showCreatePage) {
      setShowCreatePage(false);
    }
  }, [showCreatePage]);

  return (
    <>
      <Tooltip title="Create new page">
        <IconButton
          data-testid="create-page-btn"
          size="small"
          unpadded
          onClick={() => setShowCreatePage(true)}
        >
          <FontAwesomeIcon icon={faAdd} />
        </IconButton>
      </Tooltip>
      <CreatePageModal
        close={close}
        accountId={accountId}
        show={showCreatePage}
      />
    </>
  );
};
