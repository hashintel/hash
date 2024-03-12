import type { HTMLProps } from "react";

import type {
  ColumnData,
  CreateCardCallback,
  DeleteCardCallback,
  DeleteColumnCallback,
  UpdateCardContentCallback,
  UpdateColumnTitleCallback,
} from "../types";

export interface SortableColumnProps {
  data: ColumnData;
  readonly?: boolean;
  deleteColumn?: DeleteColumnCallback;
  createCard?: CreateCardCallback;
  deleteCard?: DeleteCardCallback;
  updateColumnTitle?: UpdateColumnTitleCallback;
  updateCardContent?: UpdateCardContentCallback;
}

export interface ColumnProps extends SortableColumnProps {
  wrapperProps?: HTMLProps<HTMLDivElement>;
  titleWrapperProps?: HTMLProps<HTMLDivElement>;
}
