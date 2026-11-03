/**
 * The navigation rail: the manifest's page tree as nested groups, the
 * current page marked, and on a diff build a badge on every page that
 * changed and a count on every group holding one. A group holding the
 * current page is open; the reader's own toggles win after that.
 */

import { Link } from "@tanstack/react-router";
import { useState } from "react";

import { hrefOf } from "../pages";
import { CaretIcon } from "./icons";
import { contains, type SidebarItem } from "./sidebar/items";

const badgeVariant = {
  added: "success",
  changed: "note",
  removed: "danger",
  mixed: "note",
} as const;

const badgeText = {
  added: "new",
  changed: "changed",
  removed: "removed",
} as const;

const Badge = ({
  text,
  status,
}: {
  text: string;
  status: keyof typeof badgeVariant;
}) => <span className={`sl-badge ${badgeVariant[status]}`}>{text}</span>;

const PageLink = ({
  item,
  current,
  nested,
}: {
  item: Extract<SidebarItem, { kind: "link" }>;
  current: string;
  nested: boolean;
}) => (
  <Link
    to={hrefOf(item.slug)}
    className={nested ? undefined : "large"}
    aria-current={item.slug === current ? "page" : undefined}
    data-pnd-diff={item.status}
  >
    <span>{item.label}</span>
    {item.status === undefined ? null : (
      <Badge text={badgeText[item.status]} status={item.status} />
    )}
  </Link>
);

const Group = ({
  item,
  current,
  depth,
}: {
  item: Extract<SidebarItem, { kind: "group" }>;
  current: string;
  depth: number;
}) => {
  const holdsCurrent = contains(item, current);
  const [toggled, setToggled] = useState<boolean | null>(null);
  const [previousCurrent, setPreviousCurrent] = useState(current);
  if (current !== previousCurrent) {
    // A navigation into the group opens it again, whatever the reader did.
    setPreviousCurrent(current);
    setToggled(null);
  }
  const open = toggled ?? (holdsCurrent || !item.collapsed);
  return (
    <details
      open={open}
      onToggle={(event) => setToggled(event.currentTarget.open)}
    >
      <summary>
        <span className="group-label">
          <span className="large">{item.label}</span>
          {item.badge === undefined ? null : (
            <Badge text={item.badge.text} status={item.badge.status} />
          )}
        </span>
        <CaretIcon className="caret" size="1.25rem" />
      </summary>
      <Items items={item.items} current={current} depth={depth + 1} />
    </details>
  );
};

const Items = ({
  items,
  current,
  depth,
}: {
  items: SidebarItem[];
  current: string;
  depth: number;
}) => (
  <ul className={depth === 0 ? "top-level" : undefined}>
    {items.map((item) => (
      <li
        key={
          item.kind === "link" ? item.slug : `group:${item.slug ?? item.label}`
        }
      >
        {item.kind === "link" ? (
          <PageLink item={item} current={current} nested={depth > 0} />
        ) : (
          <Group item={item} current={current} depth={depth} />
        )}
      </li>
    ))}
  </ul>
);

export const Sidebar = ({
  items,
  current,
}: {
  items: SidebarItem[];
  current: string;
}) => <Items items={items} current={current} depth={0} />;
