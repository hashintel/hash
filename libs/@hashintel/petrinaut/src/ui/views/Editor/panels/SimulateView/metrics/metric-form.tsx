import { useStore } from "@tanstack/react-form";

import { Form, TextArea, TextInput } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";
import { getMetricDocumentUri } from "@hashintel/petrinaut-core";

import { Section, SectionList } from "../../../../../components/section";
import { CodeEditor } from "../../../../../monaco/code-editor";

import type { MetricFormInstance } from "./use-metric-form";

const codeFieldDescriptionStyle = css({
  '& [data-part="description"]': {
    fontSize: "xs",
    color: "neutral.s80",
    lineHeight: "[1.4]",
    marginBottom: "3",
  },
});

export const MetricFormBody = ({
  form,
  metricSessionId,
}: {
  form: MetricFormInstance;
  metricSessionId: string;
}) => {
  const { name, description, code } = useStore(
    form.store,
    (state) => state.values,
  );
  const nameIsBlank = name !== "" && name.trim() === "";

  return (
    <SectionList>
      <Section title="General" collapsible defaultOpen>
        <Form.Field
          label="Metric name"
          size="sm"
          errors={nameIsBlank ? ["Metric name is required."] : undefined}
        >
          <TextInput
            size="sm"
            value={name}
            onChange={(value) => form.setFieldValue("name", value)}
            invalid={nameIsBlank}
          />
        </Form.Field>

        <Form.Field label="Description" size="sm">
          <TextArea
            className={css({ minHeight: "[80px]" })}
            size="sm"
            value={description}
            onChange={(value) => form.setFieldValue("description", value)}
          />
        </Form.Field>
      </Section>

      <Section title="Code" collapsible defaultOpen>
        <Form.Field
          label="Code"
          hideLabel
          size="sm"
          className={codeFieldDescriptionStyle}
          description={
            <>
              Function body invoked with{" "}
              <code>state.places.&lt;Place&nbsp;Name&gt;</code> providing{" "}
              <code>count</code> and (for colored places) <code>tokens</code>.
              Must <code>return</code> a finite number.
            </>
          }
        >
          <CodeEditor
            language="typescript"
            path={getMetricDocumentUri(metricSessionId)}
            value={code}
            onChange={(value) => form.setFieldValue("code", value ?? "")}
            height="300px"
          />
        </Form.Field>
      </Section>
    </SectionList>
  );
};
