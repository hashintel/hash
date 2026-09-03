export class DiagnosticsTransportState {
  readonly getDiagnosticsContext = () => this.diagnosticsContext;
  readonly getDiagnosticsVersion = () => this.diagnosticsVersion;

  private diagnosticsContext = "No current TypeScript diagnostics.";
  private diagnosticsVersion = 0;
  private pendingMutationDiagnosticsVersion: number | null = null;

  consumePendingMutationDiagnosticsVersion = () => {
    const pendingVersion = this.pendingMutationDiagnosticsVersion;
    this.pendingMutationDiagnosticsVersion = null;
    return pendingVersion;
  };

  incrementDiagnosticsVersion = () => {
    this.diagnosticsVersion += 1;
  };

  markMutationPending = () => {
    this.pendingMutationDiagnosticsVersion = this.diagnosticsVersion;
  };

  setDiagnosticsContext = (diagnosticsContext: string) => {
    this.diagnosticsContext = diagnosticsContext;
  };
}
