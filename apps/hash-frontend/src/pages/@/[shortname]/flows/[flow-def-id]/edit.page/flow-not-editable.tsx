import { useRouter } from "next/router";

import { Button } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { HEADER_HEIGHT } from "../../../../../../shared/layout/layout-with-header/page-header";
import { DsComponentsScope } from "../../../../../shared/ds-components-scope";

const title = css({ textStyle: "base", fontWeight: "semibold" });
const reason = css({ textStyle: "sm", color: "fg.muted" });

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
        height: `calc(100vh - ${HEADER_HEIGHT}px)`,
        px: 2,
        textAlign: "center",
      }}
    >
      <h2 className={title}>This flow can't be edited</h2>
      <p className={reason}>
        {definedInCode
          ? "It's built into HASH, so it's changed in code rather than here."
          : "It's in a web you can't change."}
      </p>
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
