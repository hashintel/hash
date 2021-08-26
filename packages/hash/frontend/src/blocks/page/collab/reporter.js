export class Reporter {
  constructor() {
    this.state = this.node = null;
    this.setAt = 0;
  }

  clearState() {
    if (this.state) {
      document.body.removeChild(this.node);
      this.state = this.node = null;
      this.setAt = 0;
    }
  }

  failure(err) {
    this.show("fail", err.toString());
  }

  delay(err) {
    if (this.state === "fail") return;
    this.show("delay", err.toString());
  }

  show(type, message) {
    this.clearState();
    this.state = type;
    this.setAt = Date.now();
    this.node = document.body.appendChild(document.createElement("div"));
    this.node.className = "ProseMirror-report ProseMirror-report-" + type;
    this.node.textContent = message;
  }

  success() {
    if (this.state === "fail" && this.setAt > Date.now() - 1000 * 10) {
      setTimeout(() => this.success(), 5000);
    } else this.clearState();
  }
}
