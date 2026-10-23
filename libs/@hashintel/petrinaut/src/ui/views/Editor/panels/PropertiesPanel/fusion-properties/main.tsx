import { createContext, use } from "react";

import {
  Button,
  Form,
  Icon,
  TextInput,
  Tooltip,
} from "@hashintel/ds-components";
import { css, cva } from "@hashintel/ds-helpers/css";
import {
  checkFusion,
  describePortDirection,
  effectivePortDirection,
  fusionDisplayName,
  fusionMemberKey,
  resolveFusionMember,
  validateDisplayName,
} from "@hashintel/petrinaut-core";

import { usePetrinautMutations } from "../../../../../../react";
import { ActiveNetContext } from "../../../../../../react/state/active-net-context";
import { EditorContext } from "../../../../../../react/state/editor-context";
import { SDCPNContext } from "../../../../../../react/state/sdcpn-context";
import { useIsReadOnly } from "../../../../../../react/state/use-is-read-only";
import { DescriptionField } from "../../../../../components/description-field";
import { PropertyValue } from "../../../../../components/property-value";
import { Section, SectionList } from "../../../../../components/section";
import { VerticalSubViewsContainer } from "../../../../../components/sub-view/vertical/vertical-sub-views-container";
import { UI_MESSAGES } from "../../../../../constants/ui-messages";
import { useDraftField } from "../../../../../hooks/use-draft-field";

import type { SubView } from "../../../../../components/sub-view/types";
import type {
  Fusion,
  FusionProblem,
  PetrinautMutations,
} from "@hashintel/petrinaut-core";

const FusionIcon = () => <Icon name="diagramNodes" />;

const containerStyle = css({
  display: "flex",
  flexDirection: "column",
  height: "full",
  minHeight: "0",
});

const fieldsSectionStyle = css({
  paddingY: "3",
});

const titleStyle = css({
  fontSize: "lg",
  fontWeight: "semibold",
  lineHeight: "[1.2]",
});

const memberListStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "1",
});

const memberRowStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  minHeight: "8",
  paddingX: "1",
  borderRadius: "md",
  fontSize: "sm",
  _hover: { backgroundColor: "neutral.bg.surface.hover" },
});

const memberButtonStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "1.5",
  flex: "[1]",
  minWidth: "[0]",
  padding: "0",
  border: "none",
  background: "[transparent]",
  cursor: "pointer",
  textAlign: "left",
  color: "neutral.s115",
  fontSize: "sm",
  fontWeight: "medium",
});

const memberNameStyle = css({
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

const memberRoleStyle = css({
  fontSize: "xs",
  color: "neutral.s85",
  whiteSpace: "nowrap",
});

const problemStyle = cva({
  base: {
    fontSize: "xs",
    lineHeight: "[1.4]",
    paddingY: "1",
  },
  variants: {
    severity: {
      error: { color: "[#dc2626]" },
      warning: { color: "[#b45309]" },
      info: { color: "neutral.s95" },
    },
  },
});

const hintTextStyle = css({
  fontSize: "xs",
  color: "neutral.s85",
});

type FusionPropertiesData = {
  fusion: Fusion;
  problems: FusionProblem[];
  updateFusion: PetrinautMutations["updateFusion"];
  removeFusion: PetrinautMutations["removeFusion"];
  removeFusionMember: PetrinautMutations["removeFusionMember"];
};

const FusionPropertiesContext = createContext<FusionPropertiesData | null>(
  null,
);

const useFusionPropertiesContext = (): FusionPropertiesData => {
  const context = use(FusionPropertiesContext);
  if (!context) {
    throw new Error(
      "useFusionPropertiesContext must be used within FusionProperties",
    );
  }
  return context;
};

const MemberRow = ({ member }: { member: Fusion["members"][number] }) => {
  const { fusion, removeFusionMember } = useFusionPropertiesContext();
  const { petriNetDefinition } = use(SDCPNContext);
  const { activeNet } = use(ActiveNetContext);
  const { selectItem } = use(EditorContext);
  const isReadOnly = useIsReadOnly();
  const resolved = resolveFusionMember(petriNetDefinition, activeNet, member);

  const label =
    resolved === null
      ? "Missing member"
      : resolved.kind === "place"
        ? resolved.place.name
        : `${resolved.instance.name}.${resolved.place.name}`;
  const role =
    resolved === null
      ? undefined
      : resolved.kind === "place"
        ? "place of this net"
        : `${describePortDirection(
            effectivePortDirection(resolved.subnet, resolved.place),
          )} port`;
  const target =
    member.kind === "place"
      ? { type: "place" as const, id: member.placeId }
      : { type: "componentInstance" as const, id: member.componentInstanceId };

  return (
    <div className={memberRowStyle}>
      <button
        type="button"
        className={memberButtonStyle}
        onClick={() => selectItem(target)}
        title="Select on the canvas"
      >
        <Icon
          name={member.kind === "place" ? "circleFilled" : "cube"}
          size="xs"
        />
        <span className={memberNameStyle}>{label}</span>
        {role !== undefined && <span className={memberRoleStyle}>{role}</span>}
      </button>
      <Button
        aria-label={`Remove ${label} from the fusion`}
        size="xxs"
        variant="ghost"
        iconName="close"
        disabled={isReadOnly}
        tooltip={isReadOnly ? UI_MESSAGES.READ_ONLY_MODE : "Remove from fusion"}
        onClick={() => removeFusionMember({ fusionId: fusion.id, member })}
      />
    </div>
  );
};

const FusionMainContent: React.FC = () => {
  const { fusion, problems, updateFusion } = useFusionPropertiesContext();
  const isDisabled = useIsReadOnly();
  const readOnlyTooltip = isDisabled ? UI_MESSAGES.READ_ONLY_MODE : undefined;

  const nameField = useDraftField({
    sourceId: fusion.id,
    sourceValue: fusion.name ?? "",
  });

  const handleNameBlur = () => {
    const trimmed = nameField.value.trim();
    if (trimmed === "") {
      nameField.setError(null);
      if (fusion.name !== undefined) {
        updateFusion({ fusionId: fusion.id, update: { name: undefined } });
      }
      return;
    }
    const result = validateDisplayName(trimmed);
    if (!result.valid) {
      nameField.setError(result.error);
      return;
    }
    nameField.setError(null);
    if (result.name !== fusion.name) {
      updateFusion({ fusionId: fusion.id, update: { name: result.name } });
    }
  };

  return (
    <SectionList>
      <Form.Section className={fieldsSectionStyle}>
        <Form.Field
          label="Name"
          size="sm"
          errors={
            !isDisabled && nameField.error ? [nameField.error] : undefined
          }
        >
          <PropertyValue text={fusion.name ?? "(named after its anchor)"}>
            <Tooltip
              content={readOnlyTooltip ?? ""}
              disableTooltip={!isDisabled}
            >
              <TextInput
                value={nameField.value}
                size="sm"
                placeholder="Named after its anchor place"
                onChange={(name) => {
                  nameField.setValue(name);
                  if (nameField.error) nameField.setError(null);
                }}
                onBlur={handleNameBlur}
                disabled={isDisabled}
                invalid={!!nameField.error}
              />
            </Tooltip>
          </PropertyValue>
        </Form.Field>
        <DescriptionField
          sourceId={fusion.id}
          sourceValue={fusion.description}
          onCommit={(description) =>
            updateFusion({ fusionId: fusion.id, update: { description } })
          }
          disabled={isDisabled}
          tooltip={readOnlyTooltip}
        />
      </Form.Section>
      <Section title="Fused places">
        <div className={memberListStyle}>
          {fusion.members.map((member) => (
            <MemberRow key={fusionMemberKey(member)} member={member} />
          ))}
        </div>
        <div className={hintTextStyle}>
          Drag from another place or port onto one of these to add it.
        </div>
      </Section>
      {problems.length > 0 && (
        <Section title="Checks">
          {problems.map((problem) => (
            <div
              key={problem.code}
              className={problemStyle({ severity: problem.severity })}
            >
              {problem.message}
            </div>
          ))}
        </Section>
      )}
    </SectionList>
  );
};

const FusionTitle: React.FC = () => {
  const { fusion } = useFusionPropertiesContext();
  const { petriNetDefinition } = use(SDCPNContext);
  const { activeNet } = use(ActiveNetContext);
  return (
    <span className={titleStyle}>
      {fusionDisplayName(petriNetDefinition, activeNet, fusion)}
    </span>
  );
};

const DeleteFusionAction: React.FC = () => {
  const { fusion, removeFusion } = useFusionPropertiesContext();
  const { clearSelection } = use(EditorContext);
  const isReadOnly = useIsReadOnly();

  return (
    <Button
      aria-label="Delete fusion"
      size="sm"
      variant="ghost"
      tone="error"
      iconName="trash"
      onClick={() => {
        removeFusion({ fusionId: fusion.id });
        clearSelection();
      }}
      disabled={isReadOnly}
      tooltip={isReadOnly ? UI_MESSAGES.READ_ONLY_MODE : "Delete fusion"}
    />
  );
};

const fusionMainContentSubView: SubView = {
  id: "fusion-main-content",
  title: "Fusion",
  icon: FusionIcon,
  main: true,
  renderTitle: () => <FusionTitle />,
  component: FusionMainContent,
  renderHeaderAction: () => <DeleteFusionAction />,
  headerActionMutates: true,
  alwaysShowHeaderAction: true,
};

const subViews: SubView[] = [fusionMainContentSubView];

export const FusionProperties: React.FC<{ fusion: Fusion }> = ({ fusion }) => {
  const { petriNetDefinition } = use(SDCPNContext);
  const { activeNet, activeSubnetId } = use(ActiveNetContext);
  const { updateFusion, removeFusion, removeFusionMember } =
    usePetrinautMutations();
  const problems = checkFusion(
    petriNetDefinition,
    activeNet,
    fusion,
    activeSubnetId,
  );

  return (
    <div className={containerStyle}>
      <FusionPropertiesContext
        value={{
          fusion,
          problems,
          updateFusion,
          removeFusion,
          removeFusionMember,
        }}
      >
        <VerticalSubViewsContainer
          name="fusion-properties"
          subViews={subViews}
        />
      </FusionPropertiesContext>
    </div>
  );
};
