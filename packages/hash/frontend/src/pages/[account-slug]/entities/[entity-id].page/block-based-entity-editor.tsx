import { VoidFunctionComponent } from "react";
import { theme } from "../../../../shared/ui";
import { EntityEditorHeader } from "./block-based-entity-editor/entity-editor-header";
import { EntityPropertiesBlock } from "./entity-properties-block";
import { LocalReactBlockContainer } from "./local-react-block-container";

export interface BlockBasedEntityEditorProps {
  accountId: string;
  entityId: string;
}

export const BlockBasedEntityEditor: VoidFunctionComponent<
  BlockBasedEntityEditorProps
> = ({ accountId, entityId }) => {
  return (
    <>
      <EntityEditorHeader />
      <LocalReactBlockContainer
        Component={EntityPropertiesBlock}
        accountId={entityId}
        entityId={accountId}
        theme={theme}
      />
    </>
  );
};
