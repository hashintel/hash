import { ServerResponse } from "http";

export class Output {
  // eslint-disable-next-line no-useless-constructor
  constructor(
    public code: number,
    public body: any,
    public type = "text/plan" // eslint-disable-next-line no-empty-function
  ) {}

  static json(data: any) {
    return new Output(200, JSON.stringify(data), "application/json");
  }

  // Write the response.
  resp(resp: ServerResponse) {
    resp.writeHead(this.code, { "Content-Type": this.type });
    resp.end(this.body);
  }
}
