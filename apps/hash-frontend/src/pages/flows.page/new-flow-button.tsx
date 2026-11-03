import { Button } from "@hashintel/ds-components";

import { DsComponentsScope } from "../shared/ds-components-scope";

import type { CreateFlow } from "./use-create-flow";

export const NewFlowButton = ({
  createFlow,
  creating,
  canCreate,
}: CreateFlow) => (
  <DsComponentsScope sx={{ display: "contents" }}>
    <Button
      variant="solid"
      size="md"
      iconName="plus"
      loading={creating}
      disabled={!canCreate || creating}
      onClick={() => {
        void createFlow();
      }}
    >
      New flow
    </Button>
  </DsComponentsScope>
);
