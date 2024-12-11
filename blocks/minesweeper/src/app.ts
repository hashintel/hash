import { BlockElementBase } from "@blockprotocol/graph/custom-element";
import { getRoots } from "@blockprotocol/graph/stdlib";
import type { PropertyValues } from "lit";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import { mine_sweeper } from "mine-sweeper-tag";

import type { BlockEntity } from "./types/generated/block-entity";

const colsKey: keyof BlockEntity["properties"] =
  "https://blockprotocol.org/@hash/types/property-type/number-of-columns/";
const minesKey: keyof BlockEntity["properties"] =
  "https://blockprotocol.org/@hash/types/property-type/number-of-mines/";

const takeNumberOrDefault = (value: unknown, defaultValue: number) => {
  if (
    typeof value === "number" ||
    (typeof value === "string" && !Number.isNaN(parseInt(value, 10)))
  ) {
    return value;
  }
  return defaultValue;
};

export class MinesweeperBlock extends BlockElementBase<BlockEntity> {
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
      newBlockEntity.properties[minesKey]?.toString() !==
        this.getBlockEntity().properties[minesKey]?.toString()
    );
  }

  render() {
    const { [colsKey]: colsFromProperties, [minesKey]: minesFromProperties } =
      this.getBlockEntity().properties;

    const cols = takeNumberOrDefault(colsFromProperties, 16);
    const mines = takeNumberOrDefault(minesFromProperties, 40);

    // the element breaks if its attributes change after it has been rendered,
    // so we force it to be recreated by doing this
    const minesweeperHtml = `<mine-sweeper cols="${cols}" bomb="${mines}"></mine-sweeper>`;

    return unsafeHTML(minesweeperHtml);
  }
}
