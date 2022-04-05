import { Box, MenuItem } from "@mui/material";
import { useEffect } from "react";
import { useAccountEntities } from "../hooks/useAccountEntities";

export const LoadEntityMenu = () => {
  const accountId = "";
  const { data: entities, fetchEntities } = useAccountEntities();

  useEffect(() => {
    void fetchEntities(accountId, { entityTypeId: "" });
  }, [fetchEntities]);

  return (
    <>
      <Box></Box>
      {[].map(() => {
        return <MenuItem></MenuItem>;
      })}
    </>
  );
};
