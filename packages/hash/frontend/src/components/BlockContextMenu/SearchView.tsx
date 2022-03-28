import { VoidFunctionComponent } from "react";
import { tw } from "twind";
import {
  BlockSuggesterProps,
  getVariantIcon,
} from "../../blocks/page/createSuggester/BlockSuggester";
import { BlockContextMenuItem } from "./BlockContextMenuItem";
import {
  FilteredMenuItems,
  MenuState,
  ItemClickMethod,
  iconStyles,
} from "./BlockContextMenuUtils";

type SearchViewProps = {
  filteredMenuItems: FilteredMenuItems;
  entityId: string | null;
  selectedIndex: number;
  updateMenuState: (updatedState: Partial<MenuState>) => void;
  onItemClick: ItemClickMethod;
  blockSuggesterProps: BlockSuggesterProps;
};

export const SearchView: VoidFunctionComponent<SearchViewProps> = ({
  filteredMenuItems,
  entityId,
  selectedIndex,
  updateMenuState,
  onItemClick,
  blockSuggesterProps,
}) => {
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
                <BlockContextMenuItem
                  key={key}
                  selected={index === selectedIndex}
                  onClick={() => onItemClick(key)}
                  onSelect={() => updateMenuState({ selectedIndex: index })}
                  icon={icon}
                  title={title}
                />
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
              const { name } = option.variant;

              const icon = getVariantIcon(option);

              return (
                <BlockContextMenuItem
                  key={`${option.meta.name}-${option.variant.name}`}
                  selected={
                    index + filteredMenuItems.actions.length === selectedIndex
                  }
                  onClick={() =>
                    blockSuggesterProps.onChange(option.variant, option.meta)
                  }
                  onSelect={() => updateMenuState({ selectedIndex: index })}
                  icon={
                    // @todo add a fallback icon
                    <img src={icon ?? ""} alt={name} className={iconStyles} />
                  }
                  title={name}
                />
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
