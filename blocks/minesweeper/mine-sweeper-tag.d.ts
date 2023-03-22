declare module "mine-sweeper-tag" {
  export class mine_sweeper extends HTMLElement {
    cols: number;
    bomb: number;
    beep?: boolean;
  }
}
