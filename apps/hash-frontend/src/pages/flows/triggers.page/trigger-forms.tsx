import { useMutation } from "@apollo/client";
import { useMemo, useState } from "react";

import { extractWebIdFromEntityId } from "@blockprotocol/type-system";
import {
  Banner,
  Button,
  Checkbox,
  Form,
  Select,
  TextInput,
} from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";
import { getFlowType } from "@local/hash-isomorphic-utils/flows/get-flow-type";

import {
  createFlowScheduleMutation,
  updateFlowScheduleMutation,
} from "../../../graphql/queries/knowledge/flow.queries";
import { InputField } from "../../@/[shortname]/flows/[flow-def-id]/edit.page/shared/run-flow";
import {
  editorRunDataSources,
  getAiFlagBlocker,
  getFlowInputValues,
  getInitialFormValues,
  withGivenValues,
} from "../../@/[shortname]/flows/[flow-def-id]/edit.page/shared/run-form";
import { useAuthenticatedUser } from "../../shared/auth-info-context";
import { getBrowserTimeZone } from "../../shared/schedule-repeat";
import { useEnabledFeatureFlags } from "../../shared/use-enabled-feature-flags";
import { useFlowDefinitions } from "../../shared/use-flow-definitions";
import { ScheduleFields } from "./schedule-fields";
import { getNextRuns } from "./schedule-times";
import {
  defaultScheduleTime,
  getNewTriggerBlocker,
  getScheduleBlocker,
  toScheduleFormValues,
  toScheduleSpec,
} from "./trigger-form-values";

import type {
  CreateFlowScheduleMutation,
  CreateFlowScheduleMutationVariables,
  UpdateFlowScheduleMutation,
  UpdateFlowScheduleMutationVariables,
} from "../../../graphql/api-types.gen";
import type {
  NewTriggerFormValues,
  ScheduleFormValues,
} from "./trigger-form-values";
import type { EntityId, WebId } from "@blockprotocol/type-system";
import type {
  CreateFlowScheduleInput,
  ScheduleSpec,
} from "@local/hash-isomorphic-utils/flows/schedule-types";

/** How many of a schedule's next runs the form previews. */
const previewedRuns = 3;

const formFrame = css({
  display: "flex",
  flexDirection: "column",
  gap: "4",
  /* Lines the labels up under the trigger's icon. */
  pl: "14",
  pr: "6",
  pt: "3",
  pb: "5",
});
const formTitle = css({
  textStyle: "sm",
  fontWeight: "medium",
  color: "fg.body",
});
const fields = css({
  /*
   * The design's 176px label track, less the section's gap, and its 360px inputs, which span the input track, the gap
   * and the empty track for labels on the right.
   */
  gridTemplateColumns: "[156px 340px 0]",
  /* The design's 36px between fields, rather than the section's 20px gap. */
  '& > [data-part="form-field"] + [data-layout="inline"] > *:first-child': {
    marginTop: "2",
  },
});
const fieldText = css({ textStyle: "sm", color: "fg.subtle" });
/* Under the inputs, as it labels itself. */
const runNowField = css({
  "[data-part=form-section] > &": { gridColumn: "[2 / -1]", mt: "2" },
});
const actions = css({ display: "flex", gap: "2", pl: "[176px]" });
const banner = css({ maxWidth: "[536px]" });

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const ErrorBanner = ({
  title,
  message,
}: {
  title: string;
  message: string;
}) => (
  <div className={banner}>
    <Banner tone="error">
      <Banner.Title>{title}</Banner.Title>
      <Banner.Description as="div">
        {message.split("\n").map((line) => (
          <div key={line}>{line}</div>
        ))}
      </Banner.Description>
    </Banner>
  </div>
);

/** The next runs of the schedule the form's values give, from now. */
const getPreviewedRuns = (values: ScheduleFormValues) =>
  getNextRuns(toScheduleSpec(values), new Date(), previewedRuns);

/** The form for adding a schedule, of any flow the user can view, to run in one of their webs. */
export const NewTriggerForm = ({
  initialFlowEntityId,
  onAdded,
  onCancel,
}: {
  initialFlowEntityId: EntityId | null;
  /** Called once the trigger is added, e.g. to fetch the triggers again. */
  onAdded: () => Promise<void>;
  onCancel: () => void;
}) => {
  const { authenticatedUser } = useAuthenticatedUser();
  const { ai } = useEnabledFeatureFlags();
  const { flowDefinitions, loading } = useFlowDefinitions();
  const [values, setValues] = useState<NewTriggerFormValues>(() => ({
    flowEntityId: initialFlowEntityId,
    webId: null,
    name: "",
    repeat: {
      kind: "rule",
      rule: { kind: "weekly", weekdays: [1, 2, 3, 4, 5] },
    },
    time: defaultScheduleTime,
    timeZone: getBrowserTimeZone(),
    runNow: false,
    inputValues: {},
  }));
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [createFlowSchedule] = useMutation<
    CreateFlowScheduleMutation,
    CreateFlowScheduleMutationVariables
  >(createFlowScheduleMutation);

  /* The webs a flow can run in: the user's own, then their orgs'. */
  const userWebId: WebId = authenticatedUser.accountId;
  const webs = useMemo(
    () => [
      { value: userWebId, text: `@${authenticatedUser.shortname ?? ""}` },
      ...authenticatedUser.memberOf.map(({ org }) => ({
        value: org.webId,
        text: `@${org.shortname}`,
      })),
    ],
    [authenticatedUser, userWebId],
  );

  /* Only a valid flow can be scheduled. */
  const flows = useMemo(
    () =>
      flowDefinitions
        .flatMap(({ flowDefinitionEntityId, flowDefinition }) =>
          flowDefinition ? [{ flowDefinitionEntityId, flowDefinition }] : [],
        )
        .sort((left, right) =>
          left.flowDefinition.name.localeCompare(right.flowDefinition.name),
        ),
    [flowDefinitions],
  );
  const flow = flows.find(
    ({ flowDefinitionEntityId }) =>
      flowDefinitionEntityId === values.flowEntityId,
  );
  const inputs = flow?.flowDefinition.inputs ?? null;
  const flowWebId = flow
    ? extractWebIdFromEntityId(flow.flowDefinitionEntityId)
    : null;
  /* Until a web is chosen, the flow's own if the user is in it, where the editor runs it too, else the user's. */
  const webId =
    values.webId ??
    webs.find(({ value }) => value === flowWebId)?.value ??
    userWebId;

  /* The values given so far, each where the flow chosen still has an input that takes it. */
  const inputValues = withGivenValues(
    getInitialFormValues(inputs ?? []),
    values.inputValues,
  );
  const nextRuns = getPreviewedRuns(values);
  const blocker =
    (flow && getAiFlagBlocker(flow.flowDefinition, { canUseAi: ai })) ??
    getNewTriggerBlocker({ ...values, inputValues }, inputs, nextRuns);

  const add = async () => {
    if (!flow || !inputs) {
      return;
    }

    setAdding(true);
    setError(null);

    const input: CreateFlowScheduleInput = {
      name: values.name.trim(),
      flowDefinitionEntityId: flow.flowDefinitionEntityId,
      webId,
      scheduleSpec: toScheduleSpec(values),
      flowInputs: getFlowInputValues(inputs, inputValues).flowInputs,
      triggerImmediately: values.runNow,
      ...(getFlowType(flow.flowDefinition) === "ai"
        ? { dataSources: editorRunDataSources }
        : {}),
    };

    try {
      await createFlowSchedule({ variables: { input } });
      await onAdded();
    } catch (caught) {
      setError(getErrorMessage(caught));
      setAdding(false);
    }
  };

  return (
    <div className={formFrame}>
      {error !== null && (
        <ErrorBanner title="The trigger wasn't added" message={error} />
      )}
      <Form.Section className={fields}>
        <Form.Field layout="inline" label="Web">
          <Select<WebId>
            required
            readonly={webs.length === 1}
            items={webs}
            value={webId}
            onChange={(chosenWebId) =>
              setValues((current) => ({ ...current, webId: chosenWebId }))
            }
          />
        </Form.Field>
        <Form.Field layout="inline" label="Flow">
          <Select<string>
            searchable
            loading={loading && flows.length === 0}
            placeholder="Choose a flow"
            items={flows.map(({ flowDefinitionEntityId, flowDefinition }) => ({
              value: flowDefinitionEntityId,
              text: flowDefinition.name,
            }))}
            value={flow?.flowDefinitionEntityId ?? null}
            onChange={(flowEntityId) =>
              setValues((current) => ({
                ...current,
                flowEntityId: flowEntityId as EntityId | null,
              }))
            }
          />
        </Form.Field>
        <Form.Field layout="inline" label="Name">
          <TextInput
            value={values.name}
            placeholder="Name this trigger"
            onChange={(name) => setValues((current) => ({ ...current, name }))}
          />
        </Form.Field>
        <ScheduleFields
          values={values}
          nextRuns={nextRuns}
          onChange={(schedule) =>
            setValues((current) => ({ ...current, ...schedule }))
          }
        />
        {flow?.flowDefinition.inputs.map((input) => (
          <InputField
            key={input.name}
            inline
            webId={webId}
            input={input}
            value={inputValues[input.name]}
            onChange={(value) =>
              setValues((current) => ({
                ...current,
                inputValues: { ...current.inputValues, [input.name]: value },
              }))
            }
          />
        ))}
        <div className={runNowField}>
          <Checkbox
            label="Run once now"
            value={values.runNow}
            onChange={(runNow) =>
              setValues((current) => ({ ...current, runNow }))
            }
          />
        </div>
      </Form.Section>
      <div className={actions}>
        <Button variant="subtle" size="sm" disabled={adding} onClick={onCancel}>
          Cancel
        </Button>
        <Button
          size="sm"
          loading={adding}
          disabled={blocker !== null}
          tooltip={blocker ?? undefined}
          onClick={() => {
            void add();
          }}
        >
          Add trigger
        </Button>
      </div>
    </div>
  );
};

/** The form for editing when a schedule runs. Its web is read-only, as the API can't move a schedule. */
export const EditTriggerForm = ({
  scheduleEntityId,
  scheduleSpec,
  webName,
  onSaved,
  onCancel,
}: {
  scheduleEntityId: EntityId;
  scheduleSpec: ScheduleSpec;
  webName: string;
  /** Called once the schedule is saved, e.g. to fetch the triggers again. */
  onSaved: () => Promise<void>;
  onCancel: () => void;
}) => {
  const [values, setValues] = useState(() =>
    toScheduleFormValues(scheduleSpec, getBrowserTimeZone()),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [updateFlowSchedule] = useMutation<
    UpdateFlowScheduleMutation,
    UpdateFlowScheduleMutationVariables
  >(updateFlowScheduleMutation);

  const nextRuns = getPreviewedRuns(values);
  const blocker = getScheduleBlocker(values, nextRuns);

  const save = async () => {
    setSaving(true);
    setError(null);

    try {
      await updateFlowSchedule({
        variables: {
          scheduleEntityId,
          input: { scheduleSpec: toScheduleSpec(values) },
        },
      });
      await onSaved();
    } catch (caught) {
      setError(getErrorMessage(caught));
      setSaving(false);
    }
  };

  return (
    <div className={formFrame}>
      <span className={formTitle}>Edit schedule</span>
      {error !== null && (
        <ErrorBanner title="The schedule wasn't saved" message={error} />
      )}
      <Form.Section className={fields}>
        <ScheduleFields
          values={values}
          nextRuns={nextRuns}
          onChange={setValues}
        />
        <Form.Field layout="inline" label="Web" as="legend">
          <span className={fieldText}>{webName || "—"}</span>
        </Form.Field>
      </Form.Section>
      <div className={actions}>
        <Button variant="subtle" size="sm" disabled={saving} onClick={onCancel}>
          Cancel
        </Button>
        <Button
          size="sm"
          loading={saving}
          disabled={blocker !== null}
          tooltip={blocker ?? undefined}
          onClick={() => {
            void save();
          }}
        >
          Save
        </Button>
      </div>
    </div>
  );
};
