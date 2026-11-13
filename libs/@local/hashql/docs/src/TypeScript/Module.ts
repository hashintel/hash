import { isExternalModule } from "typescript/ast";

import type { SourceFile } from "typescript/ast";

export interface Module extends SourceFile {}

export const isModule = (node: SourceFile): node is Module =>
  isExternalModule(node);
