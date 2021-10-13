type ReporterStateType = "fail" | "delay";

export class Reporter {
  node: HTMLElement | null = null;
  state: null | ReporterStateType = null;
  setAt = 0;

  clearState() {
    if (this.state) {
      if (this.node) {
        document.body.removeChild(this.node);
      }

      this.node = null;
      this.state = null;
      this.setAt = 0;
    }
  }

  failure(err: Error) {
    this.show("fail", err.toString());
  }

  delay(err: Error) {
    if (this.state === "fail") return;
    this.show("delay", err.toString());
  }

  show(type: ReporterStateType, message: string) {
    this.clearState();
    this.state = type;
    this.setAt = Date.now();
    this.node = document.body.appendChild(document.createElement("div"));
    this.node.className = `ProseMirror-report ProseMirror-report-${type}`;
    this.node.textContent = message;
  }

  success() {
    if (this.state === "fail" && this.setAt > Date.now() - 1000 * 10) {
      setTimeout(() => this.success(), 5000);
    } else this.clearState();
  }
}
