import {
  BlockSettingsButton,
  GetHelpLink,
} from "@hashintel/block-design-system";
import { Collapse, Fade, Switch } from "@mui/material";
import { useState } from "react";

import type { RootKey } from "../../additional-types";
import type { BlockEntity } from "../../types/generated/block-entity";
import styles from "./styles.module.scss";

const isStripedKey: RootKey =
  "https://blockprotocol.org/@hash/types/property-type/table-rows-are-striped/";
const hideHeaderRowKey: RootKey =
  "https://blockprotocol.org/@hash/types/property-type/table-header-row-is-hidden/";
const hideRowNumbersKey: RootKey =
  "https://blockprotocol.org/@hash/types/property-type/table-row-numbers-are-hidden/";

interface SettingSwitchProps {
  label: string;
  value: boolean;
  onChange: (value: boolean) => Promise<void>;
}

const SettingSwitch = ({ label, value, onChange }: SettingSwitchProps) => {
  return (
    <div className={styles.setting}>
      <div className={styles.settingLabel}>{label}</div>
      <Switch
        size="small"
        checked={value}
        onChange={(event) => onChange(event.target.checked)}
      />
    </div>
  );
};

interface SettingsProps {
  show: boolean;
  collapseSettings: boolean;
  blockEntity: BlockEntity;
  updateEntity: (newProperties: BlockEntity["properties"]) => Promise<void>;
}

export const SettingsBar = ({
  show,
  collapseSettings,
  blockEntity,
  updateEntity,
}: SettingsProps) => {
  const {
    properties: {
      [isStripedKey]: isStriped = false,
      [hideHeaderRowKey]: hideHeaderRow = false,
      [hideRowNumbersKey]: hideRowNumbers = false,
    },
  } = blockEntity;

  const [mobileSettingsExpanded, setMobileSettingsExpanded] = useState(false);

  return (
    <Fade in={show}>
      <div className={styles.settingsBar}>
        <GetHelpLink href="https://blockprotocol.org/@hash/blocks/table" />

        {collapseSettings ? (
          <BlockSettingsButton
            expanded={mobileSettingsExpanded}
            onClick={() => setMobileSettingsExpanded(!mobileSettingsExpanded)}
          />
        ) : null}

        <Collapse in={!collapseSettings || mobileSettingsExpanded}>
          <div className={styles.settingsContainer}>
            <SettingSwitch
              label="Enable stripes for alternating rows"
              value={isStriped}
              onChange={(value) => updateEntity({ [isStripedKey]: value })}
            />
            <SettingSwitch
              label="Show header row"
              value={!hideHeaderRow}
              onChange={(value) => updateEntity({ [hideHeaderRowKey]: !value })}
            />
            <SettingSwitch
              label="Show row numbers"
              value={!hideRowNumbers}
              onChange={(value) =>
                updateEntity({ [hideRowNumbersKey]: !value })
              }
            />
          </div>
        </Collapse>
      </div>
    </Fade>
  );
};
