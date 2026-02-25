import { css } from "@hashintel/ds-helpers/css";
import { createContext, use, useMemo } from "react";

import { Input } from "../../../../components/input";
import type { SubView } from "../../../../components/sub-view/types";
import { VerticalSubViewsContainer } from "../../../../components/sub-view/vertical/vertical-sub-views-container";
import { UI_MESSAGES } from "../../../../constants/ui-messages";
import type { Parameter } from "../../../../core/types/sdcpn";
import { useIsReadOnly } from "../../../../state/use-is-read-only";

const containerStyle = css({
  display: "flex",
  flexDirection: "column",
  height: "[100%]",
  minHeight: "[0]",
});

const mainContentStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "[12px]",
});

const fieldLabelStyle = css({
  fontWeight: "medium",
  fontSize: "[12px]",
  marginBottom: "[4px]",
});

const slugifyToIdentifier = (str: string): string => {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+/, "")
    .replace(/_+$/, "")
    .replace(/^(\d)/, "_$1");
};

// --- Context ---

interface ParameterPropertiesContextValue {
  parameter: Parameter;
  updateParameter: (
    parameterId: string,
    updateFn: (parameter: Parameter) => void,
  ) => void;
}

const ParameterPropertiesContext =
  createContext<ParameterPropertiesContextValue | null>(null);

const useParameterPropertiesContext = (): ParameterPropertiesContextValue => {
  const context = use(ParameterPropertiesContext);
  if (!context) {
    throw new Error(
      "useParameterPropertiesContext must be used within ParameterProperties",
    );
  }
  return context;
};

// --- Content ---

const ParameterMainContent: React.FC = () => {
  const { parameter, updateParameter } = useParameterPropertiesContext();
  const isDisabled = useIsReadOnly();

  const handleUpdateName = (event: React.ChangeEvent<HTMLInputElement>) => {
    updateParameter(parameter.id, (existingParameter) => {
      existingParameter.name = event.target.value;
    });
  };

  const handleUpdateVariableName = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    updateParameter(parameter.id, (existingParameter) => {
      existingParameter.variableName = event.target.value;
    });
  };

  const handleBlurVariableName = (
    event: React.FocusEvent<HTMLInputElement>,
  ) => {
    const value = event.target.value.trim();
    if (value === "") {
      updateParameter(parameter.id, (existingParameter) => {
        existingParameter.variableName = "param";
      });
    } else {
      const slugified = slugifyToIdentifier(value);
      if (slugified !== value) {
        updateParameter(parameter.id, (existingParameter) => {
          existingParameter.variableName = slugified;
        });
      }
    }
  };

  const handleUpdateDefaultValue = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    updateParameter(parameter.id, (existingParameter) => {
      existingParameter.defaultValue = event.target.value;
    });
  };

  return (
    <div className={mainContentStyle}>
      {/* Name field */}
      <div>
        <div className={fieldLabelStyle}>Name</div>
        <Input
          value={parameter.name}
          onChange={handleUpdateName}
          disabled={isDisabled}
          tooltip={isDisabled ? UI_MESSAGES.READ_ONLY_MODE : undefined}
        />
      </div>

      {/* Variable Name field */}
      <div>
        <div className={fieldLabelStyle}>Variable Name</div>
        <Input
          value={parameter.variableName}
          onChange={handleUpdateVariableName}
          onBlur={handleBlurVariableName}
          disabled={isDisabled}
          monospace
          tooltip={isDisabled ? UI_MESSAGES.READ_ONLY_MODE : undefined}
        />
      </div>

      {/* Default Value field */}
      <div>
        <div className={fieldLabelStyle}>Default Value</div>
        <Input
          value={parameter.defaultValue}
          onChange={handleUpdateDefaultValue}
          disabled={isDisabled}
          monospace
          tooltip={isDisabled ? UI_MESSAGES.READ_ONLY_MODE : undefined}
        />
      </div>
    </div>
  );
};

const parameterMainContentSubView: SubView = {
  id: "parameter-main-content",
  title: "Parameter",
  main: true,
  component: ParameterMainContent,
};

const subViews: SubView[] = [parameterMainContentSubView];

// --- Export ---

interface ParameterPropertiesProps {
  parameter: Parameter;
  updateParameter: (
    parameterId: string,
    updateFn: (parameter: Parameter) => void,
  ) => void;
}

export const ParameterProperties: React.FC<ParameterPropertiesProps> = ({
  parameter,
  updateParameter,
}) => {
  const value = useMemo(
    () => ({ parameter, updateParameter }),
    [parameter, updateParameter],
  );

  return (
    <div className={containerStyle}>
      <ParameterPropertiesContext.Provider value={value}>
        <VerticalSubViewsContainer subViews={subViews} />
      </ParameterPropertiesContext.Provider>
    </div>
  );
};
