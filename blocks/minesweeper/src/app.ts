import { BlockElementBase } from "@blockprotocol/graph/custom-element";
import { css, html } from "lit";
import { mine_sweeper } from "mine-sweeper-tag";

import { RootEntity } from "./types.gen";

const nameKey: keyof RootEntity["properties"] =
  "https://blockprotocol.org/@blockprotocol/types/property-type/name/";

export class MinesweeperBlock extends BlockElementBase<RootEntity> {
  /** @see https://lit.dev/docs/components/styles */
  static styles = css`
    font-family: sans-serif;
  `;

  connectedCallback() {
    super.connectedCallback();
    customElements.define("mine-sweeper", mine_sweeper);
  }

  render() {
    return html`<h1>Minesweeper</h1>
      <mine-sweeper cols="10" bomb="10"></mine-sweeper> `;
  }
}
