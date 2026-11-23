import { Form, Tooltip } from "@hashintel/ds-components";
import { validateDisplayName } from "@hashintel/petrinaut-core";

import { useIsReadOnly } from "../../../../../../../react/editing/use-is-read-only";
import { usePetrinautMutations } from "../../../../../../../react/editing/use-petrinaut-mutations";
import { ColorSelect } from "../../../../../../components/color-select";
import { DescriptionField } from "../../../../../../components/description-field";
import { DraftFieldInput } from "../../../../../../components/draft-field-input";
import { SectionList } from "../../../../../../components/section";
import { UI_MESSAGES } from "../../../../../../constants/ui-messages";
import { usePetrinautPresentation } from "../../../../../../presentation/presentation-context";
import { fieldsSectionStyle } from "../../styles";
import { useTypePropertiesContext } from "../context";
import { DimensionsTable } from "./dimensions-table";

export const TypeMainContent: React.FC = () => {
  const { type } = useTypePropertiesContext();
  const { updateType } = usePetrinautMutations();
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
