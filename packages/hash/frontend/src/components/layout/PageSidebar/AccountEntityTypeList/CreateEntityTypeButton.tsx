import { VFC } from "react";

import { faAdd } from "@fortawesome/free-solid-svg-icons";
import { Tooltip, IconButton } from "@mui/material";
import { useRouter } from "next/router";
import { FontAwesomeSvgIcon } from "../../../icons";

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
        data-testid="create-entity-btn"
        onClick={() => {
          void router.push(`/${accountId}/types/new`);
        }}
      >
        <FontAwesomeSvgIcon icon={faAdd} />
      </IconButton>
    </Tooltip>
  );
};
