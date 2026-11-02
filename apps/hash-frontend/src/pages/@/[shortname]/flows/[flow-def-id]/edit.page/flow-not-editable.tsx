import { Typography } from "@mui/material";
import { useRouter } from "next/router";

import { Button } from "@hashintel/ds-components";

import { DsComponentsScope } from "../../../../../shared/ds-components-scope";

/**
 * Shown in place of the editor for a flow the user can't edit.
 */
export const FlowNotEditable = ({
  definedInCode,
}: {
  /** Whether the flow is one of those defined in code, rather than one in a web the user can't change. */
  definedInCode: boolean;
}) => {
  const router = useRouter();

  return (
    <DsComponentsScope
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 2,
        height: "100vh",
        px: 2,
        textAlign: "center",
      }}
    >
      <Typography sx={{ fontSize: 16, fontWeight: 600 }}>
        This flow can't be edited
      </Typography>
      <Typography
        sx={{ fontSize: 14, color: ({ palette }) => palette.gray[60] }}
      >
        {definedInCode
          ? "It's built into HASH, so it's changed in code rather than here."
          : "It's in a web you can't change."}
      </Typography>
      <Button
        variant="solid"
        size="md"
        iconName="arrowLeft"
        onClick={() => {
          void router.push("/flows");
        }}
      >
        Back to flows
      </Button>
    </DsComponentsScope>
  );
};
