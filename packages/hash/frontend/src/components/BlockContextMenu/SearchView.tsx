import { VoidFunctionComponent } from "react";
import { tw } from "twind";
import { BlockSuggesterProps } from "../../blocks/page/createSuggester/BlockSuggester";
import {
  FilteredMenuItems,
  HandleClickMethod,
  MenuState,
} from "./BlockContextMenu";

type SearchViewProps = {
  filteredMenuItems: FilteredMenuItems;
  entityId: string | null;
  menuState: MenuState;
  updateMenuState: (updatedState: Partial<MenuState>) => void;
  handleClick: HandleClickMethod;
  blockSuggesterProps: BlockSuggesterProps;
};

export const SearchView: VoidFunctionComponent<SearchViewProps> = ({
  filteredMenuItems,
  entityId,
  menuState,
  updateMenuState,
  handleClick,
  blockSuggesterProps,
}) => {
  const { selectedIndex } = menuState;

  return (
    <>
      {!!filteredMenuItems.actions.length && (
        <>
          <div className={tw`text-sm px-4 mb-1`}>Actions</div>
          <ul className={tw`text-sm mb-4`}>
            {filteredMenuItems.actions.map(({ title, icon, key }, index) => {
              if (key === "copyLink" && !entityId) {
                return null;
              }
              return (
                <li key={key} className={tw`flex`}>
                  <button
                    className={tw`flex-1 hover:bg-gray-100 ${
                      index === selectedIndex ? "bg-gray-100" : ""
                    }  flex items-center py-1 px-4 group`}
                    onFocus={() => updateMenuState({ selectedIndex: index })}
                    onMouseOver={() =>
                      updateMenuState({ selectedIndex: index })
                    }
                    onClick={() => handleClick(key)}
                    type="button"
                  >
                    {icon}
                    <span>{title}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {!!filteredMenuItems.blocks.length && (
        <>
          <div className={tw`text-sm px-4 mb-1`}>Turn Into</div>
          <ul className={tw`text-sm mb-4`}>
            {filteredMenuItems.blocks.map((option, index) => {
              const { displayName, icon } = option.variant;
              const key = option.variant.displayName;

              return (
                <li key={key} className={tw`flex`}>
                  <button
                    className={tw`flex-1 hover:bg-gray-100 ${
                      index + filteredMenuItems.actions.length === selectedIndex
                        ? "bg-gray-100"
                        : ""
                    }  flex items-center py-1 px-4 group`}
                    onFocus={() => updateMenuState({ selectedIndex: index })}
                    onMouseOver={() =>
                      updateMenuState({ selectedIndex: index })
                    }
                    onClick={() =>
                      blockSuggesterProps.onChange(option.variant, option.meta)
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
  );
};
