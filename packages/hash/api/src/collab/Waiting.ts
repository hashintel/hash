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
      this.send({});
    });
  }

  abort() {
    this.send({});
  }

  send(data: any, status = 200) {
    if (this.done) return;
    this.resp.status(status).json(data);
    this.done = true;
  }
}
