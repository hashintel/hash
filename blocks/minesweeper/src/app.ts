import { BlockElementBase } from "@blockprotocol/graph/custom-element";
import { getRoots } from "@blockprotocol/graph/stdlib";
import { html, PropertyValues } from "lit";
// eslint-disable-next-line import/extensions
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import { mine_sweeper } from "mine-sweeper-tag";

import { RootEntity } from "./types.gen";

const colsKey: keyof RootEntity["properties"] =
  "https://blockprotocol-molpob88k.stage.hash.ai/@ciaranm/types/property-type/number-of-columns/";
const bombsKey: keyof RootEntity["properties"] =
  "https://blockprotocol-molpob88k.stage.hash.ai/@ciaranm/types/property-type/number-of-bombs/";

export class MinesweeperBlock extends BlockElementBase<RootEntity> {
  connectedCallback() {
    super.connectedCallback();
    customElements.define("mine-sweeper", mine_sweeper);
  }

  protected shouldUpdate(_changedProperties: PropertyValues<this>): boolean {
    const graph = _changedProperties.get("graph");

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (!graph) {
      // this is the first render – the value was previously undefined
      return true;
    }

    const newBlockEntity = getRoots(graph.blockEntitySubgraph)[0];
    if (!newBlockEntity) {
      throw new Error("No root in updated blockEntitySubgraph");
    }
    return (
      newBlockEntity.properties[colsKey]?.toString() !==
        this.getBlockEntity().properties[colsKey]?.toString() ||
      newBlockEntity.properties[bombsKey]?.toString() !==
        this.getBlockEntity().properties[bombsKey]?.toString()
    );
  }

  render() {
    const { [colsKey]: cols = 10, [bombsKey]: bombs = 10 } =
      this.getBlockEntity().properties;

    // the element breaks if its attributes change after it has been rendered,
    // so we force it to be recreated by doing this
    const minesweeperHtml = `<mine-sweeper cols="${cols}" bomb="${bombs}"></mine-sweeper>`;

    return html`<h1>Minesweeper</h1>
      ${unsafeHTML(minesweeperHtml)}`;
  }
}
