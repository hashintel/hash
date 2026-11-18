import { Button } from "@hashintel/ds-components";

import type { CreateFlow } from "./use-create-flow";

export const NewFlowButton = ({
  createFlow,
  creating,
  canCreate,
}: CreateFlow) => (
  <Button
    variant="solid"
    size="sm"
    iconName="plus"
    loading={creating}
    disabled={!canCreate || creating}
    onClick={() => {
      void createFlow();
    }}
  >
    New flow
  </Button>
);
