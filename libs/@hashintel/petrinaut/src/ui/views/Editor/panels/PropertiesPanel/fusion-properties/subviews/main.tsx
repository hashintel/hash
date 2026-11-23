import { use } from "react";

import { Button, Form, Icon, Tooltip } from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";
import {
  checkFusion,
  describeFusionMember,
  describePortDirection,
  effectivePortDirection,
  getArcEndpointKey,
  resolveFusionMember,
  validateDisplayName,
} from "@hashintel/petrinaut-core";

import { usePetrinautMutations } from "../../../../../../../react";
import { ActiveNetContext } from "../../../../../../../react/document/active-net-context";
import { CompositionContext } from "../../../../../../../react/document/composition-context";
import { SDCPNContext } from "../../../../../../../react/document/sdcpn-context";
import { useEditorActions } from "../../../../../../../react/state/editor-context";
import { useIsReadOnly } from "../../../../../../../react/state/use-is-read-only";
import { DescriptionField } from "../../../../../../components/description-field";
import { DraftFieldInput } from "../../../../../../components/draft-field-input";
import { Section, SectionList } from "../../../../../../components/section";
import { hintTextStyle } from "../../../../../../constants/hint-text";
import { problemTextStyle } from "../../../../../../constants/problem-severity";
import { UI_MESSAGES } from "../../../../../../constants/ui-messages";
import { DeleteItemButton } from "../../delete-item-button";
import { fieldsSectionStyle, itemTitleStyle } from "../../styles";
import { useFusion } from "../context";

import type { FusionMember } from "@hashintel/petrinaut-core";

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
  // The tooltip's wrapper sets no line height, and the name's
  // `overflow: hidden` would clip descenders at the inherited one.
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

const memberKindStyle = css({
  whiteSpace: "nowrap",
});

const problemStyle = css({
  fontSize: "xs",
  lineHeight: "[1.4]",
  paddingY: "1",
});

const MemberRow = ({ member }: { member: FusionMember }) => {
  const fusion = useFusion();
  const { petriNetDefinition } = use(SDCPNContext);
  const { activeNet } = use(ActiveNetContext);
  const { selectItem } = useEditorActions();
  const { removeFusionMember } = usePetrinautMutations();
  const isReadOnly = useIsReadOnly();
  const { libraries } = use(CompositionContext);
  const label = describeFusionMember(
    petriNetDefinition,
    activeNet,
    member,
    libraries,
  );
  const resolved = resolveFusionMember(
    petriNetDefinition,
    activeNet,
    member,
    libraries,
  );
  const kindLabel =
    resolved?.kind === "port"
      ? `${describePortDirection(effectivePortDirection(resolved.component, resolved.place))} port`
      : member.kind === "place"
        ? "place of this net"
        : "instance port";

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
          <span className={cx(hintTextStyle, memberKindStyle)}>
            {kindLabel}
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

export const FusionMainContent: React.FC = () => {
  const fusion = useFusion();
  const { petriNetDefinition } = use(SDCPNContext);
  const { activeNet, activeComponentId } = use(ActiveNetContext);
  const { updateFusion } = usePetrinautMutations();
  const isDisabled = useIsReadOnly();
  const { libraries } = use(CompositionContext);
  const problems = checkFusion(
    petriNetDefinition,
    activeNet,
    fusion,
    activeComponentId,
    libraries,
  );

  return (
    <SectionList>
      <Form.Section className={fieldsSectionStyle}>
        <DraftFieldInput
          label="Name"
          sourceId={fusion.id}
          sourceValue={fusion.name}
          validate={validateDisplayName}
          onCommit={(name) =>
            updateFusion({ fusionId: fusion.id, update: { name } })
          }
        />
        <DescriptionField
          sourceId={fusion.id}
          sourceValue={fusion.description}
          onCommit={(description) =>
            updateFusion({ fusionId: fusion.id, update: { description } })
          }
        />
      </Form.Section>
      <Section title="Fused places">
        <div className={memberListStyle}>
          {fusion.members.map((member) => (
            <MemberRow key={getArcEndpointKey(member)} member={member} />
          ))}
        </div>
        {isDisabled ? null : (
          <div className={hintTextStyle}>
            Drag from another place or port onto one of these to add it.
          </div>
        )}
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

export const FusionTitle: React.FC = () => {
  const fusion = useFusion();
  return <span className={itemTitleStyle}>{fusion.name}</span>;
};

export const DeleteFusionAction: React.FC = () => {
  const fusion = useFusion();
  const { removeFusion } = usePetrinautMutations();
  const { clearSelection } = useEditorActions();

  return (
    <DeleteItemButton
      label="Delete fusion"
      onDelete={() => {
        removeFusion({ fusionId: fusion.id });
        clearSelection();
      }}
    />
  );
};
