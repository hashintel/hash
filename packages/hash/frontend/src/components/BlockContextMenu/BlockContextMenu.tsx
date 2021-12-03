import React, { useContext, useMemo, useState } from "react";
import { tw } from "twind";
import { format } from "date-fns";

import DeleteIcon from "@material-ui/icons/DeleteOutline";
import CopyIcon from "@material-ui/icons/FileCopyOutlined";
import LoopIcon from "@material-ui/icons/LoopOutlined";
import LinkIcon from "@material-ui/icons/LinkOutlined";
import { useKey } from "rooks";

import { EntityStore, isBlockEntity } from "@hashintel/hash-shared/entityStore";
import { BlockVariant } from "@hashintel/block-protocol";
import { BlockMeta } from "@hashintel/hash-shared/blockMeta";

import { blockDomId } from "../../blocks/page/BlockView";
import {
  BlockSuggester,
  BlockSuggesterProps,
} from "../../blocks/page/createSuggester/BlockSuggester";
import { useAccountInfos } from "../hooks/useAccountInfos";
import { BlockMetaContext } from "../../blocks/blockMeta";

type BlockContextMenuProps = {
  blockSuggesterProps: BlockSuggesterProps;
  closeMenu: () => void;
  entityId: string | null;
  entityStore: EntityStore;
};

type MenuItemType = {
  key: string;
  title: string;
  icon: JSX.Element;
};

const MENU_ITEMS: Array<MenuItemType> = [
  {
    key: "delete",
    title: "Delete",
    icon: <DeleteIcon className={tw`!text-inherit mr-1`} />,
  },
  {
    key: "duplicate",
    title: "Duplicate",
    icon: <CopyIcon className={tw`!text-inherit mr-1`} />,
  },
  {
    key: "copyLink",
    title: "Copy Link",
    icon: <LinkIcon className={tw`!text-inherit mr-1`} />,
  },
  {
    key: "switchBlock",
    title: "Turn into",
    icon: <LoopIcon className={tw`!text-inherit mr-1`} />,
  },
];

export const BlockContextMenu: React.VFC<BlockContextMenuProps> = ({
  blockSuggesterProps,
  closeMenu,
  entityId,
  entityStore,
}) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [subMenuVisible, setSubMenuVisible] = useState(false);

  const { data: accounts } = useAccountInfos();

  const blockData = entityId ? entityStore.saved[entityId] : null;

  if (blockData && !isBlockEntity(blockData)) {
    throw new Error("BlockContextMenu linked to non-block entity");
  }

  const [menuState, setMenuState] = useState<"normal" | "search">("normal");
  const [searchText, setSearchText] = useState("");
  const [filteredMenuItems, setFilteredMenuItems] = useState<{
    actions: Array<MenuItemType>;
    blocks: Array<{
      variant: BlockVariant;
      meta: BlockMeta;
    }>;
  }>({
    actions: [],
    blocks: [],
  });

  const blocksMeta = useContext(BlockMetaContext);

  const blockOptions = useMemo(() => {
    return Array.from(blocksMeta.values()).flatMap((blockMeta) =>
      blockMeta.componentMetadata.variants.map((variant) => ({
        variant,
        meta: blockMeta,
      })),
    );
  }, [blocksMeta]);

  const usableMenuItems = MENU_ITEMS.filter(({ key }) => {
    return key !== "copyLink" || entityId;
  });

  const searchableActions = usableMenuItems.filter(
    (item) => item.key !== "switchBlock",
  );

  const search = (newSearchText: string) => {
    setSearchText(newSearchText);

    if (!newSearchText) {
      if (menuState !== "normal") {
        setMenuState("normal");
        setSelectedIndex(0);
        setSubMenuVisible(false);
      }
    } else {
      if (menuState !== "search") {
        setMenuState("search");
        setSelectedIndex(0);
        setSubMenuVisible(false);
      }

      const filteredActions = searchableActions.filter((item) =>
        item.title
          .toLocaleLowerCase()
          .includes(newSearchText.toLocaleLowerCase()),
      );

      const filteredBlocks = blockOptions.filter((block) =>
        block.variant.displayName
          ?.toLocaleLowerCase()
          .includes(newSearchText.toLocaleLowerCase()),
      );

      setFilteredMenuItems({
        actions: filteredActions,
        blocks: filteredBlocks,
      });
    }
  };

  useKey(["ArrowUp", "ArrowDown"], (event) => {
    event.preventDefault();
    if (subMenuVisible) return;

    if (menuState === "normal") {
      let index = selectedIndex + (event.key === "ArrowUp" ? -1 : 1);
      index += usableMenuItems.length;
      index %= usableMenuItems.length;
      setSelectedIndex(index);
    } else {
      const filteredItemsLength =
        filteredMenuItems.actions.length + filteredMenuItems.blocks.length;

      let index = selectedIndex + (event.key === "ArrowUp" ? -1 : 1);
      index += filteredItemsLength;
      index %= filteredItemsLength;
      setSelectedIndex(index);
    }
  });

  useKey(["ArrowLeft", "ArrowRight"], (event) => {
    if (usableMenuItems[selectedIndex]?.key === "switchBlock") {
      setSubMenuVisible(event.key === "ArrowRight");
    }
  });

  useKey(["Escape"], () => {
    closeMenu();
  });

  const handleClick = (key: typeof MENU_ITEMS[number]["key"]) => {
    // handle menu item click here
    switch (key) {
      case "delete":
        break;
      case "switchBlock":
        setSubMenuVisible(!subMenuVisible);
        break;
      case "copyLink": {
        const url = new URL(document.location.href);
        url.hash = blockDomId(entityId!);
        void navigator.clipboard.writeText(url.toString());
        break;
      }
    }

    if (key !== "switchBlock") {
      closeMenu();
    }
  };

  return (
    <div
      className={tw`absolute z-10 w-60 bg-white border-gray-200 border-1 shadow-xl rounded`}
    >
      <div className={tw`px-4 pt-3 mb-2`}>
        <input
          autoFocus
          value={searchText}
          onChange={(event) => search(event.target.value)}
          className={tw`block w-full px-2 py-1 bg-gray-50 border-1 text-sm rounded-sm `}
          placeholder="Filter actions..."
          onKeyDown={(event) => {
            // Is Enter causing a new-line? Read this: https://hashintel.slack.com/archives/C02K2ARC1BK/p1638433216067800
            if (event.key === "Enter") {
              event.preventDefault();
              if (menuState === "normal") {
                if (usableMenuItems[selectedIndex]?.key === "switchBlock") {
                  setSubMenuVisible(true);
                } else {
                  handleClick(usableMenuItems[selectedIndex].key);
                }
              } else if (selectedIndex < filteredMenuItems.actions.length) {
                handleClick(filteredMenuItems.actions[selectedIndex].key);
              } else {
                const selectedBlock =
                  filteredMenuItems.blocks[
                    selectedIndex - filteredMenuItems.actions.length
                  ];
                blockSuggesterProps.onChange(
                  selectedBlock.variant,
                  selectedBlock.meta,
                );
              }
            }
          }}
        />
      </div>
      {menuState === "normal" ? (
        <>
          <ul className={tw`text-sm mb-4`}>
            {usableMenuItems.map(({ title, icon, key }, index) => {
              return (
                <li key={key} className={tw`flex`}>
                  <button
                    className={tw`flex-1 hover:bg-gray-100 ${
                      index === selectedIndex ? "bg-gray-100" : ""
                    }  flex items-center py-1 px-4 group`}
                    onFocus={() => setSelectedIndex(index)}
                    onMouseOver={() => {
                      if (key === "switchBlock") {
                        setSubMenuVisible(true);
                      }
                      setSelectedIndex(index);
                    }}
                    onClick={() => handleClick(key)}
                    type="button"
                  >
                    {icon}
                    <span>{title}</span>
                    {key === "switchBlock" && (
                      <span className={tw`ml-auto`}>&rarr;</span>
                    )}
                    {key === "switchBlock" &&
                      index === selectedIndex &&
                      subMenuVisible && (
                        <BlockSuggester
                          className="left-full ml-0.5 mt-2 block text-left hover:block group-hover:block shadow-xl"
                          {...blockSuggesterProps}
                        />
                      )}
                  </button>
                </li>
              );
            })}
          </ul>
          <div
            className={tw`border-t-1 border-gray-200 px-4 py-2 text-xs text-gray-400`}
          >
            <p>
              Last edited by {/* @todo use lastedited value when available */}
              {
                accounts.find(
                  (account) =>
                    account.entityId ===
                    blockData?.properties.entity.createdById,
                )?.name
              }
            </p>
            {typeof blockData?.properties.entity.updatedAt === "string" && (
              <p>
                {format(
                  new Date(blockData.properties.entity.updatedAt),
                  "hh.mm a",
                )}
                {", "}
                {format(
                  new Date(blockData.properties.entity.updatedAt),
                  "dd/MM/yyyy",
                )}
              </p>
            )}
          </div>
        </>
      ) : (
        <>
          {!!filteredMenuItems.actions.length && (
            <>
              <div className={tw`text-sm px-4 mb-1`}>Actions</div>
              <ul className={tw`text-sm mb-4`}>
                {filteredMenuItems.actions.map(
                  ({ title, icon, key }, index) => {
                    if (key === "copyLink" && !entityId) {
                      return null;
                    }
                    return (
                      <li key={key} className={tw`flex`}>
                        <button
                          className={tw`flex-1 hover:bg-gray-100 ${
                            index === selectedIndex ? "bg-gray-100" : ""
                          }  flex items-center py-1 px-4 group`}
                          onFocus={() => setSelectedIndex(index)}
                          onMouseOver={() => setSelectedIndex(index)}
                          onClick={() => handleClick(key)}
                          type="button"
                        >
                          {icon}
                          <span>{title}</span>
                          {key === "switchBlock" && (
                            <span className={tw`ml-auto`}>&rarr;</span>
                          )}
                          {key === "switchBlock" && index === selectedIndex && (
                            <BlockSuggester
                              className={`left-full ml-0.5 mt-2 ${
                                subMenuVisible ? "block" : "hidden"
                              } text-left hover:block group-hover:block shadow-xl`}
                              {...blockSuggesterProps}
                            />
                          )}
                        </button>
                      </li>
                    );
                  },
                )}
              </ul>
            </>
          )}

          {!!filteredMenuItems.blocks.length && (
            <>
              <div className={tw`text-sm px-4 mb-1`}>Turn Into</div>
              <ul className={tw`text-sm mb-4`}>
                {filteredMenuItems.blocks.map((option, index) => {
                  const { displayName, icon } = option.variant;
                  const key = index;

                  return (
                    <li key={key} className={tw`flex`}>
                      <button
                        className={tw`flex-1 hover:bg-gray-100 ${
                          index + filteredMenuItems.actions.length ===
                          selectedIndex
                            ? "bg-gray-100"
                            : ""
                        }  flex items-center py-1 px-4 group`}
                        onFocus={() => setSelectedIndex(index)}
                        onMouseOver={() => setSelectedIndex(index)}
                        onClick={() =>
                          blockSuggesterProps.onChange(
                            option.variant,
                            option.meta,
                          )
                        }
                        type="button"
                      >
                        <img
                          src={icon}
                          alt={displayName}
                          className={tw`!text-inherit mr-1`}
                        />
                        <span>{displayName}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}

          {!filteredMenuItems.actions && !filteredMenuItems.blocks && (
            <div className={tw`text-sm px-4 mb-1`}>No Results</div>
          )}
        </>
      )}
    </div>
  );
};
