export const readPetrinautNetToolName = "read_petrinaut_net";
export const readPetrinautDiagnosticsToolName = "read_petrinaut_diagnostics";
export const layoutPetrinautNetToolName = "layout_petrinaut_net";
export const READ_PETRINAUT_DOCS_TOOL_NAME = "read_petrinaut_docs";

export const isReadPetrinautNetToolName = (name: string): boolean =>
  name === readPetrinautNetToolName;

export const isReadPetrinautDiagnosticsToolName = (name: string): boolean =>
  name === readPetrinautDiagnosticsToolName;

export const isLayoutPetrinautNetToolName = (name: string): boolean =>
  name === layoutPetrinautNetToolName;

export const isReadPetrinautDocsToolName = (name: string): boolean =>
  name === READ_PETRINAUT_DOCS_TOOL_NAME;
