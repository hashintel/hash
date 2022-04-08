import { Response } from "express";
import { Instance } from "./Instance";

// An object to assist in waiting for a collaborative editing
// instance to publish a new version before sending the version
// event data to the client.
export class Waiting {
  done = false;

  constructor(
    public resp: Response,
    public inst: Instance,
    public userId: string | null,
    public finish: () => void,
  ) {
    this.inst = inst;
    this.userId = userId;
    this.finish = finish;
    resp.setTimeout(1000 * 60 * 5, () => {
      this.abort();
      this.send({});
    });
  }

  abort() {
    const found = this.inst.waiting.indexOf(this);
    if (found > -1) this.inst.waiting.splice(found, 1);
  }

  send(data: any, status = 200) {
    if (this.done) return;
    this.resp.status(status).json(data);
    this.done = true;
  }
}
