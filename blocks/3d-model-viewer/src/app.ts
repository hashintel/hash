import "@google/model-viewer";

import { BlockElementBase } from "@blockprotocol/graph/custom-element";
import { css, html } from "lit";

import { RootEntity } from "./types.gen";

export class BlockElement extends BlockElementBase<RootEntity> {
  /** @see https://lit.dev/docs/components/styles */
  static styles = css`
    font-family: sans-serif;
  `;

  /** @see https://lit.dev/docs/components/rendering */
  render() {
    if (!this.blockEntity) {
      return null;
    }

    const { properties } = this.blockEntity;

    return html`<model-viewer
      alt="${properties[
        "https://alpha.hash.ai/@ciaran/types/property-type/alt/"
      ]}"
      cameral-controls
      environment-image="https://modelviewer.dev/shared-assets/environments/moon_1k.hdr"
      src="${properties[
        "https://alpha.hash.ai/@ciaran/types/property-type/src/"
      ]}"
      enable-pan
      touch-action="pan-y"
    />`;
  }
}
