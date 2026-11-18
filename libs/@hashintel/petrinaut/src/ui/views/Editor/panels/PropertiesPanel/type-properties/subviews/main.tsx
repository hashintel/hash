import { Form, Tooltip } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";
import { validateDisplayName } from "@hashintel/petrinaut-core";

import { useIsReadOnly } from "../../../../../../../react/state/use-is-read-only";
import { ColorSelect } from "../../../../../../components/color-select";
import { DescriptionField } from "../../../../../../components/description-field";
import { DraftFieldInput } from "../../../../../../components/draft-field-input";
import { SectionList } from "../../../../../../components/section";
import { TokenTypeIcon } from "../../../../../../constants/entity-icons";
import { UI_MESSAGES } from "../../../../../../constants/ui-messages";
import { usePetrinautPresentation } from "../../../../../shared/presentation-context";
import { useTypePropertiesContext } from "../context";
import { DimensionsTable } from "./dimensions-table";

import type { SubView } from "../../../../../../components/sub-view/types";

const fieldsSectionStyle = css({
  paddingY: "3",
});

const TypeMainContent: React.FC = () => {
  const { type, updateType } = useTypePropertiesContext();
  const isDisabled = useIsReadOnly();
  const presentation = usePetrinautPresentation();

  return (
    <SectionList>
      <Form.Section className={fieldsSectionStyle}>
        <DraftFieldInput
          label="Name"
          sourceId={type.id}
          sourceValue={type.name}
          validate={validateDisplayName}
          onCommit={(name) =>
            updateType({
              typeId: type.id,
              update: { name },
            })
          }
          disabled={isDisabled}
          tooltip={isDisabled ? UI_MESSAGES.READ_ONLY_MODE : undefined}
        />

        <DescriptionField
          sourceId={type.id}
          sourceValue={type.description}
          onCommit={(description) =>
            updateType({
              typeId: type.id,
              update: { description },
            })
          }
          disabled={isDisabled}
          tooltip={isDisabled ? UI_MESSAGES.READ_ONLY_MODE : undefined}
        />

        <Form.Field label="Color" size="sm" disabled={isDisabled}>
          <Tooltip
            content={isDisabled ? UI_MESSAGES.READ_ONLY_MODE : ""}
            disableTooltip={!isDisabled}
          >
            <ColorSelect
              value={type.displayColor}
              onChange={(color) => {
                updateType({
                  typeId: type.id,
                  update: { displayColor: color },
                });
              }}
              disabled={isDisabled}
            />
          </Tooltip>
        </Form.Field>
      </Form.Section>

      <Form.Section className={fieldsSectionStyle}>
        <Form.Field
          as="legend"
          label="Dimensions"
          size="sm"
          disabled={isDisabled}
          labelTooltip="A type is an ordered tuple of token attributes. Real attributes can be updated by dynamics; the other kinds are discrete. Drag a row's gutter, or press Alt with an arrow key, to reorder."
        >
          <DimensionsTable
            readOnly={!presentation.showMutationActions || isDisabled}
          />
        </Form.Field>
      </Form.Section>
    </SectionList>
  );
};

export const typeMainContentSubView: SubView = {
  id: "type-main-content",
  title: "Type",
  icon: TokenTypeIcon,
  main: true,
  component: TypeMainContent,
};
