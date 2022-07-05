import { LitElement } from "lit";

import {
  BlockHookProperties,
  HookBlockHandler,
  UpdateEntityData,
} from "./index";

export interface BlockElementBase<
  _BlockEntityProperties extends Record<string, unknown> | null,
> extends LitElement,
    BlockHookProperties<_BlockEntityProperties> {}

export abstract class BlockElementBase<
  _BlockEntityProperties extends Record<string, unknown> | null,
> extends LitElement {
  protected hookService?: HookBlockHandler;

  static properties = {
    hook: { type: Object },
  };

  connectedCallback() {
    super.connectedCallback();
    if (!this.hookService || this.hookService.destroyed) {
      this.hookService = new HookBlockHandler({ element: this });
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this.hookService && !this.hookService.destroyed) {
      this.hookService.destroy();
    }
  }

  // /**
  //  * Alias for this.hook.blockEntity
  //  */
  // protected get blockEntity():
  //   | BlockHookProperties<BlockEntityProperties>["hook"]["blockEntity"]
  //   | undefined {
  //   return this.hook?.blockEntity;
  // }

  /**
   * Update the properties of the entity loaded into the block, i.e. this.hook.blockEntity
   * @param _properties the properties to update, which will be merged with any others
   */
  protected updateSelf(_properties: UpdateEntityData["properties"]) {
    if (!this.hookService) {
      throw new Error("Cannot updateSelf – hookService not yet connected.");
    }
    if (!this.hook) {
      throw new Error(
        "Cannot update self: no 'hook' property object passed to block.",
      );
    }
    /* else if (!this.hook.blockEntity) {
      throw new Error(
        "Cannot update self: no 'blockEntity' on 'hook' object passed to block",
      );
    } else if (!this.hook.blockEntity.entityId) {
      throw new Error(
        "Cannot update self: no 'entityId' on hook.blockEntity passed to block",
      );
    }

    return this.hookService.updateEntity({
      data: { entityId: this.hook.blockEntity.entityId, properties },
    }); */
  }
}
