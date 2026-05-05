"use client";

/* eslint-disable import/no-extraneous-dependencies, react/no-array-index-key, @typescript-eslint/prefer-nullish-coalescing */

import { Pagination, usePaginationContext } from "@ark-ui/react/pagination";
import { createStyleContext } from "@hashintel/ds-helpers/jsx";
import { pagination } from "@hashintel/ds-helpers/recipes";
import { EllipsisIcon } from "lucide-react";
import type { ComponentProps } from "react";

import { IconButton } from "../icon-button/icon-button";

const { withProvider, withContext } = createStyleContext(pagination);

export type RootProps = ComponentProps<typeof Root>;
export const Root = withProvider(Pagination.Root, "root");
export const RootProvider = withProvider(Pagination.RootProvider, "root");
export const Item = withContext(Pagination.Item, "item");
export const Ellipsis = withContext(Pagination.Ellipsis, "ellipsis");
export const PrevTrigger = withContext(Pagination.PrevTrigger, "prevTrigger");
export const NextTrigger = withContext(Pagination.NextTrigger, "nextTrigger");

export { PaginationContext as Context } from "@ark-ui/react/pagination";

export interface PaginationItemsProps
  extends React.HTMLAttributes<HTMLElement> {
  render: (page: {
    type: "page";
    value: number;
    selected: boolean;
  }) => React.ReactNode;
  ellipsis?: React.ReactElement | undefined;
}

export const Items = (props: PaginationItemsProps) => {
  const ctx = usePaginationContext();
  const { render, ellipsis, ...rest } = props;

  return ctx.pages.map((page, index) => {
    if (page.type === "ellipsis") {
      return (
        // @ts-expect-error - color prop type mismatch with rest spread
        <Ellipsis asChild key={index} index={index} {...rest}>
          {ellipsis || (
            // @ts-expect-error - "gray" colorPalette not in token set
            <IconButton as="span" colorPalette="gray">
              <EllipsisIcon />
            </IconButton>
          )}
        </Ellipsis>
      );
    }

    return (
      // @ts-expect-error - color prop type mismatch with rest spread
      <Item asChild key={index} type="page" value={page.value} {...rest}>
        {render({ ...page, selected: ctx.page === page.value })}
      </Item>
    );
  });
};
