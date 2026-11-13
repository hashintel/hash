import { createContext, use } from "react";

import { Button, Form, Icon, Tooltip } from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";
import {
  checkFusion,
  describeFusionMember,
  fusionDisplayName,
  getArcEndpointKey,
  validateDisplayName,
} from "@hashintel/petrinaut-core";

import { usePetrinautMutations } from "../../../../../../react";
import { ActiveNetContext } from "../../../../../../react/state/active-net-context";
import { EditorContext } from "../../../../../../react/state/editor-context";
import { SDCPNContext } from "../../../../../../react/state/sdcpn-context";
import { useIsReadOnly } from "../../../../../../react/state/use-is-read-only";
import { DescriptionField } from "../../../../../components/description-field";
import { DraftFieldInput } from "../../../../../components/draft-field-input";
import { Section, SectionList } from "../../../../../components/section";
import { VerticalSubViewsContainer } from "../../../../../components/sub-view/vertical/vertical-sub-views-container";
import { FusionIcon } from "../../../../../constants/entity-icons";
import { problemTextStyle } from "../../../../../constants/problem-severity";
import { UI_MESSAGES } from "../../../../../constants/ui-messages";

import type { SubView } from "../../../../../components/sub-view/types";
import type { Fusion, FusionMember } from "@hashintel/petrinaut-core";

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

/** The tooltip's wrapper is the row's item: it takes the width the row has left. */
const memberTriggerStyle = css({
  flex: "[1]",
  minWidth: "[0]",
});

const memberButtonStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "1.5",
  width: "full",
  // The tooltip's wrapper sets none, and a name is clipped to its line.
  lineHeight: "[1.5]",
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

const hintTextStyle = css({
  fontSize: "xs",
  color: "neutral.s85",
  whiteSpace: "nowrap",
});

const problemStyle = css({
  fontSize: "xs",
  lineHeight: "[1.4]",
  paddingY: "1",
});

const FusionContext = createContext<Fusion | null>(null);

const useFusion = (): Fusion => {
  const fusion = use(FusionContext);
  if (!fusion) {
    throw new Error("useFusion must be used within FusionProperties");
  }
  return fusion;
};

/** A blank name is valid: it leaves the fusion named after its anchor. */
const validateFusionName = (draft: string) =>
  draft.trim() === ""
    ? ({ valid: true, name: "" } as const)
    : validateDisplayName(draft);

const MemberRow = ({ member }: { member: FusionMember }) => {
  const fusion = useFusion();
  const { petriNetDefinition } = use(SDCPNContext);
  const { activeNet } = use(ActiveNetContext);
  const { selectItem } = use(EditorContext);
  const { removeFusionMember } = usePetrinautMutations();
  const isReadOnly = useIsReadOnly();
  const label = describeFusionMember(petriNetDefinition, activeNet, member);

  return (
    <div className={memberRowStyle}>
      <Tooltip content="Select on the canvas" className={memberTriggerStyle}>
        <button
          type="button"
          className={memberButtonStyle}
          onClick={() =>
            selectItem(
              member.kind === "place"
                ? { type: "place", id: member.placeId }
                : { type: "componentInstance", id: member.componentInstanceId },
            )
          }
        >
          <Icon
            name={member.kind === "place" ? "circleFilled" : "cube"}
            size="xs"
          />
          <span className={memberNameStyle}>{label}</span>
          <span className={hintTextStyle}>
            {member.kind === "place" ? "place of this net" : "instance port"}
          </span>
        </button>
      </Tooltip>
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
  const fusion = useFusion();
  const { petriNetDefinition } = use(SDCPNContext);
  const { activeNet, activeSubnetId } = use(ActiveNetContext);
  const { updateFusion } = usePetrinautMutations();
  const isDisabled = useIsReadOnly();
  const readOnlyTooltip = isDisabled ? UI_MESSAGES.READ_ONLY_MODE : undefined;
  const problems = checkFusion(
    petriNetDefinition,
    activeNet,
    fusion,
    activeSubnetId,
  );

  return (
    <SectionList>
      <Form.Section className={fieldsSectionStyle}>
        <DraftFieldInput
          label="Name"
          sourceId={fusion.id}
          sourceValue={fusion.name ?? ""}
          placeholder="Named after its anchor place"
          validate={validateFusionName}
          onCommit={(name) =>
            updateFusion({
              fusionId: fusion.id,
              update: { name: name === "" ? undefined : name },
            })
          }
          disabled={isDisabled}
          tooltip={readOnlyTooltip}
        />
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
            <MemberRow key={getArcEndpointKey(member)} member={member} />
          ))}
        </div>
        <div className={hintTextStyle}>
          Drag from another place or port onto one of these to add it.
        </div>
      </Section>
      {problems.length > 0 && (
        <Section title="Checks">
          {problems.map((problem, index) => (
            <div
              // The list is derived afresh on every render, and one check can
              // report twice on one fusion.
              // eslint-disable-next-line react/no-array-index-key
              key={index}
              className={cx(problemStyle, problemTextStyle)}
              data-severity={problem.severity}
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
  const fusion = useFusion();
  const { petriNetDefinition } = use(SDCPNContext);
  const { activeNet } = use(ActiveNetContext);
  return (
    <span className={titleStyle}>
      {fusionDisplayName(petriNetDefinition, activeNet, fusion)}
    </span>
  );
};

const DeleteFusionAction: React.FC = () => {
  const fusion = useFusion();
  const { removeFusion } = usePetrinautMutations();
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

export const FusionProperties: React.FC<{ fusion: Fusion }> = ({ fusion }) => (
  <div className={containerStyle}>
    <FusionContext value={fusion}>
      <VerticalSubViewsContainer name="fusion-properties" subViews={subViews} />
    </FusionContext>
  </div>
);
