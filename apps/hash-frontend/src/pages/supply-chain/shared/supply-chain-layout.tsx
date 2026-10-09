import { getLayoutWithSidebar } from "../../../shared/layout";
import { SupplyChainShell } from "./supply-chain-layout/supply-chain-shell";

import type { ReactElement, ReactNode } from "react";

export const getSupplyChainLayout = (page: ReactElement): ReactNode =>
  getLayoutWithSidebar(<SupplyChainShell>{page}</SupplyChainShell>, {
    fullWidth: true,
  });
