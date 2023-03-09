import { useState } from "react";
import { useLayer } from "react-laag";
import { useKey } from "rooks";
import { RootEntity } from "../../types";
import styles from "./styles.module.scss";
import { RootKey } from "../../additional-types";

const isStripedKey: RootKey =
  "https://blockprotocol-hk4sbmd9k.stage.hash.ai/@yusuf123/types/property-type/is-striped/";
const hideHeaderRowKey: RootKey =
  "https://blockprotocol-hk4sbmd9k.stage.hash.ai/@yusuf123/types/property-type/hide-header-row/";
const hideRowNumbersKey: RootKey =
  "https://blockprotocol-hk4sbmd9k.stage.hash.ai/@yusuf123/types/property-type/hide-row-numbers/";

interface SettingsProps {
  blockEntity: RootEntity;
  updateEntity: (newProperties: RootEntity["properties"]) => Promise<void>;
}

export const Settings = ({ blockEntity, updateEntity }: SettingsProps) => {
  useKey(["Escape"], () => isOpen && setOpen(false));

  const [isOpen, setOpen] = useState(false);

  const { renderLayer, triggerProps, layerProps } = useLayer({
    isOpen,
    triggerOffset: 10,
    onOutsideClick: () => setOpen(false),
    auto: true,
    possiblePlacements: ["bottom-center", "bottom-end", "bottom-start"],
    overflowContainer: false,
  });

  const {
    properties: {
      [isStripedKey]: isStriped = false,
      [hideHeaderRowKey]: hideHeaderRow = false,
      [hideRowNumbersKey]: hideRowNumbers = false,
    },
  } = blockEntity;

  return (
    <>
      <div
        {...triggerProps}
        className={styles.settingsButton}
        onClick={() => setOpen(!isOpen)}
      />
      {isOpen &&
        renderLayer(
          <div
            {...layerProps}
            className={styles.popover}
            style={layerProps.style}
          >
            <div className={styles.title}>Table Configuration</div>

            <div className={styles.option}>
              <input
                type="checkbox"
                id="isStriped"
                checked={isStriped}
                onChange={() => updateEntity({ [isStripedKey]: !isStriped })}
              />
              <label htmlFor="isStriped">
                Enable stripes for alternating rows
              </label>
            </div>

            <div className={styles.option}>
              <input
                type="checkbox"
                id="hideHeaderRow"
                checked={hideHeaderRow}
                onChange={() =>
                  updateEntity({ [hideHeaderRowKey]: !hideHeaderRow })
                }
              />
              <label htmlFor="hideHeaderRow">Hide header row</label>
            </div>

            <div className={styles.option}>
              <input
                type="checkbox"
                id="hideRowNumbers"
                checked={hideRowNumbers}
                onChange={() =>
                  updateEntity({ [hideRowNumbersKey]: !hideRowNumbers })
                }
              />
              <label htmlFor="hideRowNumbers">Hide row numbers</label>
            </div>
          </div>,
        )}
    </>
  );
};
