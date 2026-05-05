import { forwardRef, Fragment, type ReactNode } from "react";

import * as StyledBreadcrumb from "./breadcrumb";

export interface BreadcrumbProps extends StyledBreadcrumb.RootProps {
  items: Array<{ title: ReactNode; url?: string }>;
}

export const Breadcrumb = forwardRef<HTMLDivElement, BreadcrumbProps>(
  (props, ref) => {
    const { items, ...rootProps } = props;

    return (
      <StyledBreadcrumb.Root ref={ref} {...rootProps}>
        <StyledBreadcrumb.List>
          {items.map((item, index) => {
            const last = index === items.length - 1;

            return last ? (
              <StyledBreadcrumb.Item key={index}>
                {item.title}
              </StyledBreadcrumb.Item>
            ) : (
              <Fragment key={index}>
                <StyledBreadcrumb.Item>
                  {item.url ? (
                    <StyledBreadcrumb.Link href={item.url}>
                      {item.title}
                    </StyledBreadcrumb.Link>
                  ) : (
                    item.title
                  )}
                </StyledBreadcrumb.Item>
                <StyledBreadcrumb.Separator />
              </Fragment>
            );
          })}
        </StyledBreadcrumb.List>
      </StyledBreadcrumb.Root>
    );
  },
);
