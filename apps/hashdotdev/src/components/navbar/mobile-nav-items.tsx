import {
  Collapse,
  Divider,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
} from "@mui/material";
import {
  Dispatch,
  Fragment,
  FunctionComponent,
  ReactElement,
  SetStateAction,
  useContext,
  useEffect,
  useState,
} from "react";

import {
  generatePathWithoutParams,
  pageHasOpenSubPage,
} from "../../pages/shared/page-utils";
import { SiteMapPage, SiteMapPageSection } from "../../pages/shared/sitemap";
import { SiteMapContext } from "../../pages/shared/sitemap-context";
import { ChevronDownRegularIcon } from "../icons/chevron-down-regular-icon";
import { HashtagRegularIcon } from "../icons/hashtag-regular-icon";
import { Link } from "../link";
import { itemIsPage, pageTitleToIcons } from "./util";

type MobileNavNestedPageProps<T extends SiteMapPage | SiteMapPageSection> = {
  icon?: ReactElement;
  item: T;
  hydrationFriendlyAsPath: string;
  parentPageHref: T extends SiteMapPageSection ? string : undefined;
  depth?: number;
  expandedItems: { href: string; depth: number }[];
  setExpandedItems: Dispatch<SetStateAction<{ href: string; depth: number }[]>>;
  onClose: () => void;
};

const MobileNavNestedPage = <T extends SiteMapPage | SiteMapPageSection>({
  icon,
  depth = 0,
  expandedItems,
  parentPageHref,
  setExpandedItems,
  item,
  onClose,
  hydrationFriendlyAsPath,
}: MobileNavNestedPageProps<T>) => {
  const pathWithoutParams = generatePathWithoutParams(hydrationFriendlyAsPath);

  const { title } = item;

  const isRoot = depth === 0;

  const href = itemIsPage(item)
    ? item.href
    : `${parentPageHref}#${item.anchor}`;

  const isSelected =
    pathWithoutParams === href ||
    (itemIsPage(item) &&
      pageHasOpenSubPage({
        pathWithoutParams,
        subPages: item.subPages,
      }));

  const hasChildren = itemIsPage(item)
    ? item.subPages.length > 0 || item.sections.length > 0
    : item.subSections.length > 0;

  const isOpen =
    hasChildren &&
    expandedItems.some(
      (expandedItem) =>
        expandedItem.href === href && expandedItem.depth === depth,
    );

  return (
    <>
      <Link href={href}>
        <ListItemButton
          selected={isSelected}
          onClick={() => {
            if (hasChildren && !isOpen) {
              setExpandedItems((prev) => [...prev, { href, depth }]);
            }
            onClose();
          }}
          sx={(theme) => ({
            backgroundColor: isRoot ? undefined : theme.palette.gray[20],
            "&.Mui-selected": {
              backgroundColor: isRoot ? undefined : theme.palette.gray[20],
              "&:hover": {
                backgroundColor: isRoot ? undefined : theme.palette.gray[40],
              },
            },
            "&:hover": {
              backgroundColor: isRoot ? undefined : theme.palette.gray[40],
            },
            pl: (icon ? 2 : 4) + depth * 2,
          })}
        >
          {!!icon || !itemIsPage(item) ? (
            <ListItemIcon
              sx={(theme) => ({
                minWidth: isRoot ? undefined : theme.spacing(3),
              })}
            >
              {icon ?? (
                <HashtagRegularIcon sx={{ color: "inherit", fontSize: 15 }} />
              )}
            </ListItemIcon>
          ) : null}
          <ListItemText
            primary={title}
            sx={{
              wordBreak: "break-word",
              "> .MuiListItemText-primary": {
                display: "inline",
              },
            }}
          />
          {hasChildren ? (
            <IconButton
              sx={{
                transition: (theme) => theme.transitions.create("transform"),
                transform: `rotate(${isOpen ? "0deg" : "-90deg"})`,
              }}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setExpandedItems((prev) =>
                  isOpen
                    ? prev.filter(
                        (expandedItem) =>
                          !(
                            expandedItem.href === href &&
                            expandedItem.depth === depth
                          ),
                      )
                    : [...prev, { href, depth }],
                );
              }}
            >
              <ChevronDownRegularIcon sx={{ fontSize: 15 }} />
            </IconButton>
          ) : null}
        </ListItemButton>
      </Link>
      {hasChildren ? (
        <Collapse in={isOpen} timeout="auto" unmountOnExit>
          <List component="div" disablePadding>
            {(itemIsPage(item) ? item.sections : item.subSections).map(
              (subSection) => (
                <MobileNavNestedPage<SiteMapPageSection>
                  hydrationFriendlyAsPath={hydrationFriendlyAsPath}
                  key={subSection.anchor}
                  depth={depth + 1}
                  parentPageHref={
                    itemIsPage(item) ? item.href : (parentPageHref as string)
                  }
                  item={subSection}
                  expandedItems={expandedItems}
                  setExpandedItems={setExpandedItems}
                  onClose={onClose}
                />
              ),
            )}
            {itemIsPage(item)
              ? item.subPages.map((subPage) => (
                  <MobileNavNestedPage<SiteMapPage>
                    hydrationFriendlyAsPath={hydrationFriendlyAsPath}
                    key={subPage.href}
                    depth={depth + 1}
                    item={subPage}
                    parentPageHref={undefined}
                    expandedItems={expandedItems}
                    setExpandedItems={setExpandedItems}
                    onClose={onClose}
                  />
                ))
              : null}
          </List>
        </Collapse>
      ) : null}
    </>
  );
};

type MobileNavItemsProps = {
  hydrationFriendlyAsPath: string;
  onClose: () => void;
};

const getInitialExpandedItems = ({
  hydrationFriendlyAsPath,
  parentHref,
  item,
  depth = 0,
}: {
  hydrationFriendlyAsPath: string;
  parentHref?: string;
  item: SiteMapPage | SiteMapPageSection;
  depth?: number;
}): { href: string; depth: number }[] => {
  const pathWithoutParams = generatePathWithoutParams(hydrationFriendlyAsPath);

  const expandedChildren = [
    ...(itemIsPage(item)
      ? item.subPages
          .map((page) =>
            getInitialExpandedItems({
              item: page,
              hydrationFriendlyAsPath,
              depth: depth + 1,
            }),
          )
          .flat()
      : []),
    ...(itemIsPage(item) ? item.sections : item.subSections)
      .map((section) =>
        getInitialExpandedItems({
          item: section,
          hydrationFriendlyAsPath,
          depth: depth + 1,
          parentHref: itemIsPage(item) ? item.href : parentHref,
        }),
      )
      .flat(),
  ];

  const href = itemIsPage(item) ? item.href : `${parentHref}#${item.anchor}`;

  const isExpanded = pathWithoutParams === href || expandedChildren.length > 0;

  return isExpanded
    ? [
        {
          href,
          depth,
        },
        ...expandedChildren,
      ]
    : [];
};

export const MobileNavItems: FunctionComponent<MobileNavItemsProps> = ({
  onClose,
  hydrationFriendlyAsPath,
}) => {
  const { pages } = useContext(SiteMapContext);

  const [expandedItems, setExpandedItems] = useState<
    { href: string; depth: number }[]
  >(
    pages
      .map((page) =>
        getInitialExpandedItems({ hydrationFriendlyAsPath, item: page }),
      )
      .flat(),
  );

  useEffect(() => {
    setExpandedItems((prev) => [
      ...prev,
      ...pages
        .map((page) =>
          getInitialExpandedItems({ hydrationFriendlyAsPath, item: page }),
        )
        .flat()
        .filter(
          (expanded) =>
            prev.find(
              ({ depth, href }) =>
                expanded.depth === depth && expanded.href === href,
            ) === undefined,
        ),
    ]);
  }, [hydrationFriendlyAsPath, pages]);

  return (
    <List>
      {pages.map((page) => (
        <Fragment key={page.href}>
          <MobileNavNestedPage<SiteMapPage>
            hydrationFriendlyAsPath={hydrationFriendlyAsPath}
            key={page.href}
            icon={pageTitleToIcons[page.title]}
            item={page}
            parentPageHref={undefined}
            expandedItems={expandedItems}
            setExpandedItems={setExpandedItems}
            onClose={onClose}
          />
          <Divider sx={{ borderColor: ({ palette }) => palette.gray[20] }} />
        </Fragment>
      ))}
    </List>
  );
};
