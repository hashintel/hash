import { VFC } from "react";

import { faAdd } from "@fortawesome/free-solid-svg-icons";
import { Tooltip } from "@mui/material";
import { useRouter } from "next/router";
import { FontAwesomeIcon } from "../../../icons";
import { IconButton } from "../../../IconButton";

type CreateEntityTypeButtonProps = {
  accountId: string;
};

export const CreateEntityTypeButton: VFC<CreateEntityTypeButtonProps> = ({
  accountId,
}) => {
  const router = useRouter();

  return (
    <Tooltip title="Create new type">
      {/* @todo-mui use a LinkButton here once it has been implemented */}
      <IconButton
        size="small"
        unpadded
        data-testid="create-entity-btn"
        onClick={() => {
          void router.push(`/${accountId}/types/new`);
        }}
      >
        <FontAwesomeIcon icon={faAdd} />
      </IconButton>
    </Tooltip>
  );
};
