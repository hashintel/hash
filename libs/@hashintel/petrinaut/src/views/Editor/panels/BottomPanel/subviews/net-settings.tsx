import { css } from "@hashintel/ds-helpers/css";
import { use } from "react";

import { Select } from "../../../../../components/select";
import type { SelectOption } from "../../../../../components/select";
import type { SubView } from "../../../../../components/sub-view/types";
import type { SDCPNLanguage } from "../../../../../core/types/sdcpn";
import { getSDCPNLanguage } from "../../../../../core/types/sdcpn";
import { SDCPNContext } from "../../../../../state/sdcpn-context";
import { useIsReadOnly } from "../../../../../state/use-is-read-only";

const containerStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "3",
});

const fieldStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
});

const labelStyle = css({
  fontSize: "xs",
  fontWeight: "medium",
  color: "neutral.s115",
  whiteSpace: "nowrap",
});

const LANGUAGE_OPTIONS: SelectOption[] = [
  { value: "typescript", label: "TypeScript" },
  { value: "python", label: "Python" },
];

const NetSettingsContent: React.FC = () => {
  const { petriNetDefinition, mutatePetriNetDefinition } = use(SDCPNContext);
  const isReadOnly = useIsReadOnly();
  const currentLanguage = getSDCPNLanguage(petriNetDefinition);

  const handleLanguageChange = (value: string) => {
    mutatePetriNetDefinition((sdcpn) => {
      sdcpn.language = value as SDCPNLanguage;
    });
  };

  return (
    <div className={containerStyle}>
      <div className={fieldStyle}>
        <span className={labelStyle}>Expression language</span>
        <Select
          value={currentLanguage}
          onValueChange={handleLanguageChange}
          options={LANGUAGE_OPTIONS}
          size="xs"
          disabled={isReadOnly}
        />
      </div>
    </div>
  );
};

export const netSettingsSubView: SubView = {
  id: "net-settings",
  title: "Settings",
  tooltip: "Configure net-level settings such as the expression language.",
  component: NetSettingsContent,
};
