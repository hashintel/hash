import { forwardRef, HTMLAttributes, CSSProperties } from "react";
// import classNames from "classnames";

// import { Action, Handle, Remove } from "../../../../components";
import styles from "./tree-item.module.scss";

export interface TreeItemProps
  extends Omit<HTMLAttributes<HTMLLIElement>, "id"> {
  childCount?: number;
  clone?: boolean;
  collapsed?: boolean;
  depth: number;
  // disableInteraction?: boolean;
  disableSelection?: boolean;
  handleProps?: any;
  indentationWidth: number;
  value: string;
  onCollapse?(): void;
  onRemove?(): void;
  wrapperRef?(node: HTMLLIElement): void;
}

const collapseIcon = (
  <svg width="10" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 70 41">
    <path d="M30.76 39.2402C31.885 40.3638 33.41 40.995 35 40.995C36.59 40.995 38.115 40.3638 39.24 39.2402L68.24 10.2402C69.2998 9.10284 69.8768 7.59846 69.8494 6.04406C69.822 4.48965 69.1923 3.00657 68.093 1.90726C66.9937 0.807959 65.5106 0.178263 63.9562 0.150837C62.4018 0.123411 60.8974 0.700397 59.76 1.76024L35 26.5102L10.24 1.76024C9.10259 0.700397 7.59822 0.123411 6.04381 0.150837C4.4894 0.178263 3.00632 0.807959 1.90702 1.90726C0.807714 3.00657 0.178019 4.48965 0.150593 6.04406C0.123167 7.59846 0.700153 9.10284 1.75999 10.2402L30.76 39.2402Z" />
  </svg>
);

export const TreeItem = forwardRef<HTMLDivElement, TreeItemProps>(
  (
    {
      childCount,
      clone,
      depth,
      // disableSelection,
      // disableInteraction,
      // ghost,
      handleProps,
      indentationWidth,
      // indicator,
      collapsed,
      // onCollapse,
      // onRemove,
      style,
      value,
      wrapperRef,
      ...props
    },
    ref,
  ) => {
    return (
      <li
        // className={classNames(
        //   styles.Wrapper,
        //   clone && styles.clone,
        //   ghost && styles.ghost,
        //   indicator && styles.indicator,
        //   disableSelection && styles.disableSelection,
        //   disableInteraction && styles.disableInteraction,
        // )}
        ref={wrapperRef}
        style={
          {
            listStyle: "none",
            boxSizing: "border-box",
            paddingLeft: `${indentationWidth * depth}px`,
            marginBottom: -1,

            // .TreeItem {
            //   --vertical-padding: 5px;

            //   padding-right: 24px;
            //   border-radius: 4px;
            //   box-shadow: 0px 15px 15px 0 rgba(34, 33, 81, 0.1);
            // }

            "--spacing": `${indentationWidth * depth}px`,
          } as CSSProperties
        }
        {...props}
      >
        <div
          ref={ref}
          style={{
            position: "relative",
            display: "flex",
            alignItems: "center",
            padding: 10,
            backgroundColor: "#fff",
            border: "1px solid #dedede",
            color: "#222",
            boxSizing: "border-box",
            ...style,
          }}
        >
          {/* <Handle {...handleProps} /> */}
          <div {...handleProps}>O</div>
          {/* {onCollapse && (
            <Action
              onClick={onCollapse}
              // className={classNames(
              //   styles.Collapse,
              //   collapsed && styles.collapsed,
              // )}
            >
              {collapseIcon}
            </Action>
          )} */}
          {collapseIcon}
          <span
            style={{
              flexGrow: 1,
              paddingLeft: "0.5rem",
              whiteSpace: "nowrap",
              textOverflow: "ellipsis",
              overflow: "hidden",
            }}
          >
            {value}
          </span>
          {/* {!clone && onRemove && <Remove onClick={onRemove} />} */}
          {clone && childCount && childCount > 1 ? (
            <span className={styles.Count}>{childCount}</span>
          ) : null}
        </div>
      </li>
    );
  },
);
