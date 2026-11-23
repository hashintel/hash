/**
 * The authoring surface of the scenario drawers: name + description above
 * the Initial State + Parameters form in expose mode — each top-level
 * Variable offers a "Scenario Parameter" toggle, and the exposed Variables
 * become the saved scenario's tunable parameters. The same body edits a
 * scenario stored in any format: a scenario that defines its initial state
 * as code shows that code read-only in the Initial state slot and keeps it
 * verbatim on save.
 */

import { Button, Form, TextArea, TextInput } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import {
  AdHocScenarioForm,
  FormLayoutColumn,
} from "../../../../../components/ad-hoc-scenario-form/ad-hoc-scenario-form";
import { OverlayScrollArea } from "../../../../../components/overlay-scroll-area";
import { Section, SectionList } from "../../../../../components/section";
import { CodeEditor } from "../../../../../monaco/code-editor";
import { DrawerErrorDisplay } from "../drawer-error-display";
import {
  overlayScrollDrawerBodyStyle,
  overlayScrollDrawerViewportStyle,
} from "../shared/overlay-scroll-drawer-styles";
import { SimulationPanel } from "../shared/simulation-panel";

import type { AdHocScenarioAuthoring } from "./use-ad-hoc-scenario-authoring";
import type { ReactNode } from "react";

const fieldsStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "4",
  marginBottom: "5",
});

const codeNoteStyle = css({
  fontSize: "xs",
  color: "neutral.s90",
  margin: "[0]",
  marginBottom: "3",
});

/** Fixed, so Monaco's lazy load moves nothing around the code slot. */
const codeSlotHeight = "300px";

/** One object, so a render of the form gives Monaco no new options to apply. */
const codeSlotOptions = { readOnly: true };

const codeScenarioNotice =
  "This scenario defines its initial state as code, shown here read-only. Only Variables marked Scenario Parameter are kept with it, each as its computed default. Edit the code from the AI assistant or the net file, or recreate the scenario from the form (a Dynamic row builds many tokens from one count).";

/**
 * The drawer body: name, description, an optional note beneath them, and
 * the expose-mode form. A draft carrying code lays the form out itself:
 * Variables and Parameters as sections, the code read-only where the
 * Initial state blocks would sit.
 */
export const AdHocScenarioAuthoringBody: React.FC<{
  authoring: AdHocScenarioAuthoring;
  children?: ReactNode;
}> = ({ authoring, children }) => {
  const { code } = authoring;
  return (
    <SimulationPanel.Body
      withPadding={false}
      scrollable={false}
      className={overlayScrollDrawerBodyStyle}
    >
      <OverlayScrollArea viewportClassName={overlayScrollDrawerViewportStyle}>
        <div className={fieldsStyle}>
          <Form.Field
            label="Scenario name"
            size="sm"
            errors={
              authoring.nameError && authoring.name !== ""
                ? [authoring.nameError]
                : undefined
            }
          >
            <TextInput
              size="sm"
              value={authoring.name}
              onChange={authoring.setName}
              invalid={
                authoring.nameError !== undefined && authoring.name !== ""
              }
            />
          </Form.Field>
          <Form.Field label="Description" size="sm">
            <TextArea
              className={css({ minHeight: "[80px]" })}
              size="sm"
              value={authoring.description}
              onChange={authoring.setDescription}
            />
          </Form.Field>
          {children}
        </div>
        <AdHocScenarioForm
          state={authoring.state}
          onChange={authoring.setState}
          context={authoring.context}
          selection="expose"
          sessionId={authoring.sessionId}
          renderLayout={
            code === undefined
              ? undefined
              : ({ variables, parameters }) => (
                  <FormLayoutColumn>
                    <SectionList>
                      <Section title="Variables">{variables}</Section>
                      {parameters ? (
                        <Section title="Parameters">{parameters}</Section>
                      ) : null}
                      <Section title="Initial state">
                        <p className={codeNoteStyle}>{codeScenarioNotice}</p>
                        <CodeEditor
                          language="typescript"
                          value={code}
                          options={codeSlotOptions}
                          height={codeSlotHeight}
                        />
                      </Section>
                    </SectionList>
                  </FormLayoutColumn>
                )
          }
        />
      </OverlayScrollArea>
    </SimulationPanel.Body>
  );
};

/** The footer of both scenario panels: the error summary, then close and save. */
export const AdHocScenarioAuthoringFooter = ({
  authoring,
  closeLabel,
  saveLabel,
  onClose,
  onSave,
}: {
  authoring: AdHocScenarioAuthoring;
  closeLabel: string;
  saveLabel: string;
  onClose: () => void;
  onSave: () => void;
}) => (
  <SimulationPanel.Footer
    secondaryActions={
      <DrawerErrorDisplay
        count={authoring.errorCount + (authoring.saveError ? 1 : 0)}
        firstMessage={authoring.firstError ?? authoring.saveError ?? undefined}
      />
    }
    actions={
      <>
        <Button variant="subtle" tone="neutral" size="sm" onClick={onClose}>
          {closeLabel}
        </Button>
        <Button
          variant="solid"
          tone="neutral"
          size="sm"
          disabled={!authoring.canSave}
          tooltip={authoring.firstError}
          onClick={onSave}
        >
          {saveLabel}
        </Button>
      </>
    }
  />
);
