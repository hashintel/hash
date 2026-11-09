import { useRouter } from "next/router";

import { Button } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { HEADER_HEIGHT } from "../../../../../../shared/layout/layout-with-header/page-header";
import { DsComponentsScope } from "../../../../../shared/ds-components-scope";

const notEditable = css({
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: "4",
  px: "4",
  textAlign: "center",
});
const title = css({ textStyle: "base", fontWeight: "semibold" });

/**
 * Shown in place of the editor for a flow the user can't edit.
 */
export const FlowNotEditable = () => {
  const router = useRouter();

  return (
    <DsComponentsScope>
      <div
        className={notEditable}
        style={{ height: `calc(100vh - ${HEADER_HEIGHT}px)` }}
      >
        <h2 className={title}>You can't edit this flow</h2>
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
      </div>
    </DsComponentsScope>
  );
};
