import { FunctionComponent } from "react";
import { theme } from "@hashintel/hash-design-system";
import { EntityPropertiesBlock } from "./entity-properties-block";
import { LocalReactBlockContainer } from "./local-react-block-container";

export interface BlockBasedEntityEditorProps {
  accountId: string;
  entityId: string;
}

export const BlockBasedEntityEditor: FunctionComponent<
  BlockBasedEntityEditorProps
> = ({ accountId, entityId }) => {
  return (
    <>
      <h1>Block-based entity editor (WIP)</h1>
      <LocalReactBlockContainer
        Component={EntityPropertiesBlock}
        accountId={entityId}
        entityId={accountId}
        theme={theme}
      />
    </>
  );
};
