import { css, cx } from "@hashintel/ds-helpers/css";
import {
  getDocumentUri,
  getPlaceDynamicsEquationIds,
} from "@hashintel/petrinaut-core";

import { usePetrinautMutations } from "../../../../react/hooks/use-petrinaut-mutations";
import { useIsReadOnly } from "../../../../react/state/use-is-read-only";
import { arcPlaceId, placeName } from "../notebook-model";
import { fieldLabelStyle, fieldRowStyle, fieldValueStyle } from "./part-styles";
import {
  BodyCodeBlock,
  FieldRow,
  PartSelect,
  PartTextField,
  WidgetPart,
} from "./part-widgets";

import type { ActiveNetDefinition } from "../../../../react/document/active-net-context";
import type { NotebookCell } from "../notebook-model";
import type { BodyPartContext } from "./cell-body-parts";
import type {
  Color,
  DifferentialEquation,
  Parameter,
  Place,
  Transition,
} from "@hashintel/petrinaut-core";

const partLineStyle = css({
  width: "fit",
  paddingX: "1",
  borderRadius: "sm",
});

/** A multi-cell line: a plain layout row whose cells are the focus targets. */
const cellLineStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "1",
});

const sectionLabelStyle = css({
  fontSize: "xs",
  fontWeight: "semibold",
  color: "neutral.fg.subtle",
  textTransform: "uppercase",
  letterSpacing: "wide",
  marginTop: "1",
});

const arcListStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "0.5",
  fontSize: "xs",
  fontFamily: "mono",
  color: "neutral.s115",
});

const mutedStyle = css({
  fontSize: "xs",
  color: "neutral.fg.subtle",
});

const UNTYPED = "__untyped__";

/** What a select of a token type offers: no type, then every type of the net. */
const tokenTypeOptions = (net: ActiveNetDefinition) => [
  { value: UNTYPED, label: "untyped" },
  ...net.types.map((color) => ({
    value: color.id,
    label: color.name || color.id,
  })),
];

/** The types a field of a token type and a parameter can have. */
const valueTypeOptions = [
  { value: "real", label: "real" },
  { value: "integer", label: "integer" },
  { value: "boolean", label: "boolean" },
];

const PlaceBody: React.FC<{
  net: ActiveNetDefinition;
  place: Place;
  parts: BodyPartContext;
}> = ({ net, place, parts }) => {
  const { updatePlace } = usePetrinautMutations();
  const isReadOnly = useIsReadOnly();
  const composedEquationNames = getPlaceDynamicsEquationIds(place).map(
    (equationId) =>
      net.differentialEquations.find(({ id }) => id === equationId)?.name ??
      equationId,
  );

  return (
    <>
      <FieldRow label="Name" parts={parts} partId="name">
        <PartTextField
          sourceId={place.id}
          value={place.name}
          aria-label="Place name"
          onCommit={(name) =>
            updatePlace({ placeId: place.id, update: { name } })
          }
        />
      </FieldRow>
      <FieldRow label="Type" parts={parts} partId="type">
        <PartSelect
          aria-label="Token type"
          value={place.colorId ?? UNTYPED}
          options={tokenTypeOptions(net)}
          onChange={(value) =>
            updatePlace({
              placeId: place.id,
              update: { colorId: value === UNTYPED ? null : value },
            })
          }
        />
      </FieldRow>
      <div className={fieldRowStyle}>
        <span className={fieldLabelStyle}>Dynamics</span>
        <span className={fieldValueStyle}>
          <span className={cellLineStyle}>
            <WidgetPart parts={parts} partId="dynamics" column={0}>
              <input
                type="checkbox"
                tabIndex={-1}
                aria-label="Dynamics enabled"
                disabled={isReadOnly}
                checked={place.dynamicsEnabled}
                onChange={(event) =>
                  updatePlace({
                    placeId: place.id,
                    update: { dynamicsEnabled: event.target.checked },
                  })
                }
              />
            </WidgetPart>
            {place.dynamicsEnabled ? (
              composedEquationNames.length > 0 ? (
                <span>{composedEquationNames.join(" + ")}</span>
              ) : (
                <span className={mutedStyle}>no equations composed</span>
              )
            ) : (
              <span className={mutedStyle}>disabled</span>
            )}
          </span>
        </span>
      </div>
      {place.isPort ? (
        <FieldRow label="Port" parts={parts} partId="port">
          exposed as component port
        </FieldRow>
      ) : null}
      {place.visualizerCode?.trim() ? (
        <>
          <span className={sectionLabelStyle}>Visualizer</span>
          <BodyCodeBlock
            parts={parts}
            partId="code-visualizer"
            code={place.visualizerCode}
            path={getDocumentUri("place-visualizer", place.id)}
            onChange={(code) =>
              updatePlace({
                placeId: place.id,
                update: { visualizerCode: code },
              })
            }
          />
        </>
      ) : null}
    </>
  );
};

const arcJumpStyle = css({
  cursor: "pointer",
  backgroundColor: "[transparent]",
  borderWidth: "[0]",
  padding: "[0]",
  fontFamily: "mono",
  fontSize: "xs",
  color: "neutral.s115",
  _hover: { textDecoration: "underline" },
});

const INPUT_ARC_TYPES: { value: string; label: string }[] = [
  { value: "standard", label: "standard" },
  { value: "read", label: "read" },
  { value: "inhibitor", label: "inhibitor" },
];

const ArcLine: React.FC<{
  net: ActiveNetDefinition;
  transitionId: string;
  direction: "input" | "output";
  placeId: string;
  weight: number;
  arcType: string | null;
  index: number;
  partId: string;
  parts: BodyPartContext;
}> = ({
  net,
  transitionId,
  direction,
  placeId,
  weight,
  arcType,
  index,
  partId,
  parts,
}) => {
  const { updateArcWeight, updateArcType } = usePetrinautMutations();

  return (
    <div className={cx(partLineStyle, cellLineStyle)}>
      <span>{index + 1}.</span>
      <WidgetPart parts={parts} partId={partId} column={0}>
        <button
          type="button"
          tabIndex={-1}
          className={arcJumpStyle}
          title="Jump to this place"
          onClick={() => parts.navigateToCell(placeId)}
        >
          {placeName(net, placeId)}
        </button>
      </WidgetPart>
      <span>×</span>
      <WidgetPart parts={parts} partId={partId} column={1}>
        <PartTextField
          sourceId={`${transitionId} ${partId}`}
          value={String(weight)}
          aria-label="Arc weight"
          isValid={(draft) =>
            Number(draft) > 0 && Number.isFinite(Number(draft))
          }
          onCommit={(draft) =>
            updateArcWeight({
              transitionId,
              arcDirection: direction,
              placeId,
              weight: Number(draft),
            })
          }
        />
      </WidgetPart>
      {arcType !== null && (
        <WidgetPart parts={parts} partId={partId} column={2}>
          <PartSelect
            aria-label="Arc type"
            value={arcType}
            options={INPUT_ARC_TYPES}
            onChange={(value) =>
              updateArcType({
                transitionId,
                placeId,
                type: value as "standard" | "read" | "inhibitor",
              })
            }
          />
        </WidgetPart>
      )}
    </div>
  );
};

const ArcLines: React.FC<{
  net: ActiveNetDefinition;
  transitionId: string;
  direction: "input" | "output";
  arcs: { placeId: string | null; weight: number; arcType: string | null }[];
  partPrefix: string;
  parts: BodyPartContext;
}> = ({ net, transitionId, direction, arcs, partPrefix, parts }) =>
  arcs.length > 0 ? (
    <div className={arcListStyle}>
      {arcs.map(({ placeId, weight, arcType }, index) =>
        placeId === null ? (
          <span key={`port-${String(index)}`}>
            {index + 1}. component port ×{weight}
          </span>
        ) : (
          <ArcLine
            key={`${placeId} ${String(index)}`}
            net={net}
            transitionId={transitionId}
            direction={direction}
            placeId={placeId}
            weight={weight}
            arcType={arcType}
            index={index}
            partId={`${partPrefix}-${index}`}
            parts={parts}
          />
        ),
      )}
    </div>
  ) : (
    <span className={mutedStyle}>None</span>
  );

const TransitionBody: React.FC<{
  net: ActiveNetDefinition;
  transition: Transition;
  parts: BodyPartContext;
}> = ({ net, transition, parts }) => {
  const { updateTransition } = usePetrinautMutations();
  return (
    <>
      <FieldRow label="Name" parts={parts} partId="name">
        <PartTextField
          sourceId={transition.id}
          value={transition.name}
          aria-label="Transition name"
          onCommit={(name) =>
            updateTransition({ transitionId: transition.id, update: { name } })
          }
        />
      </FieldRow>

      <span className={sectionLabelStyle}>Inputs</span>
      <ArcLines
        net={net}
        transitionId={transition.id}
        direction="input"
        arcs={transition.inputArcs.map((arc) => ({
          placeId: arcPlaceId(arc),
          weight: arc.weight,
          arcType: arc.type,
        }))}
        partPrefix="in"
        parts={parts}
      />

      <span className={sectionLabelStyle}>Outputs</span>
      <ArcLines
        net={net}
        transitionId={transition.id}
        direction="output"
        arcs={transition.outputArcs.map((arc) => ({
          placeId: arcPlaceId(arc),
          weight: arc.weight,
          arcType: null,
        }))}
        partPrefix="out"
        parts={parts}
      />

      <span className={sectionLabelStyle}>
        Firing time —{" "}
        {transition.lambdaType === "predicate" ? "predicate" : "stochastic"}
      </span>
      <BodyCodeBlock
        parts={parts}
        partId="code-lambda"
        code={transition.lambdaCode}
        path={getDocumentUri("transition-lambda", transition.id)}
        onChange={(code) =>
          updateTransition({
            transitionId: transition.id,
            update: { lambdaCode: code },
          })
        }
      />

      <span className={sectionLabelStyle}>Transition kernel</span>
      <BodyCodeBlock
        parts={parts}
        partId="code-kernel"
        code={transition.transitionKernelCode}
        path={getDocumentUri("transition-kernel", transition.id)}
        onChange={(code) =>
          updateTransition({
            transitionId: transition.id,
            update: { transitionKernelCode: code },
          })
        }
      />
    </>
  );
};

const TypeBody: React.FC<{ color: Color; parts: BodyPartContext }> = ({
  color,
  parts,
}) => {
  const { updateType, updateTypeElement } = usePetrinautMutations();

  return (
    <>
      <FieldRow label="Name" parts={parts} partId="name">
        <PartTextField
          sourceId={color.id}
          value={color.name}
          aria-label="Type name"
          onCommit={(name) =>
            updateType({ typeId: color.id, update: { name } })
          }
        />
      </FieldRow>
      <FieldRow label="Display color" parts={parts} partId="display-color">
        <PartTextField
          sourceId={color.id}
          value={color.displayColor}
          aria-label="Display color"
          onCommit={(displayColor) =>
            updateType({ typeId: color.id, update: { displayColor } })
          }
        />
      </FieldRow>
      <span className={sectionLabelStyle}>Fields</span>
      {color.elements.length > 0 ? (
        <div className={arcListStyle}>
          {color.elements.map((element) => (
            <div
              key={element.elementId}
              className={cx(partLineStyle, cellLineStyle)}
            >
              <WidgetPart
                parts={parts}
                partId={`field-${element.elementId}`}
                column={0}
              >
                <PartTextField
                  sourceId={element.elementId}
                  value={element.name}
                  aria-label="Field name"
                  onCommit={(name) =>
                    updateTypeElement({
                      typeId: color.id,
                      elementId: element.elementId,
                      update: { name },
                    })
                  }
                />
              </WidgetPart>
              <span>:</span>
              <WidgetPart
                parts={parts}
                partId={`field-${element.elementId}`}
                column={1}
              >
                <PartSelect
                  aria-label="Field type"
                  value={element.type}
                  options={valueTypeOptions}
                  onChange={(value) =>
                    updateTypeElement({
                      typeId: color.id,
                      elementId: element.elementId,
                      update: { type: value as "real" | "integer" | "boolean" },
                    })
                  }
                />
              </WidgetPart>
            </div>
          ))}
        </div>
      ) : (
        <span className={mutedStyle}>No fields</span>
      )}
    </>
  );
};

const ParameterBody: React.FC<{
  parameter: Parameter;
  parts: BodyPartContext;
}> = ({ parameter, parts }) => {
  const { updateParameter } = usePetrinautMutations();
  return (
    <>
      <FieldRow label="Name" parts={parts} partId="name">
        <PartTextField
          sourceId={parameter.id}
          value={parameter.name}
          aria-label="Parameter name"
          onCommit={(name) =>
            updateParameter({ parameterId: parameter.id, update: { name } })
          }
        />
      </FieldRow>
      <FieldRow label="Variable name" parts={parts} partId="variable-name">
        <PartTextField
          sourceId={parameter.id}
          value={parameter.variableName}
          aria-label="Variable name"
          isValid={(draft) => /^[A-Za-z_$][\w$]*$/.test(draft)}
          onCommit={(variableName) =>
            updateParameter({
              parameterId: parameter.id,
              update: { variableName },
            })
          }
        />
      </FieldRow>
      <FieldRow label="Type" parts={parts} partId="type">
        <PartSelect
          aria-label="Parameter type"
          value={parameter.type}
          options={valueTypeOptions}
          onChange={(value) =>
            updateParameter({
              parameterId: parameter.id,
              update: { type: value as "real" | "integer" | "boolean" },
            })
          }
        />
      </FieldRow>
      <FieldRow label="Default value" parts={parts} partId="default-value">
        <PartTextField
          sourceId={parameter.id}
          value={parameter.defaultValue}
          aria-label="Default value"
          onCommit={(defaultValue) =>
            updateParameter({
              parameterId: parameter.id,
              update: { defaultValue },
            })
          }
        />
      </FieldRow>
    </>
  );
};

const EquationBody: React.FC<{
  net: ActiveNetDefinition;
  equation: DifferentialEquation;
  parts: BodyPartContext;
}> = ({ net, equation, parts }) => {
  const { updateDifferentialEquation } = usePetrinautMutations();
  return (
    <>
      <FieldRow label="Name" parts={parts} partId="name">
        <PartTextField
          sourceId={equation.id}
          value={equation.name}
          aria-label="Equation name"
          onCommit={(name) =>
            updateDifferentialEquation({
              equationId: equation.id,
              update: { name },
            })
          }
        />
      </FieldRow>
      <FieldRow label="Applies to type" parts={parts} partId="type">
        <PartSelect
          aria-label="Applies to type"
          value={equation.colorId ?? UNTYPED}
          options={tokenTypeOptions(net)}
          onChange={(value) =>
            updateDifferentialEquation({
              equationId: equation.id,
              update: { colorId: value === UNTYPED ? null : value },
            })
          }
        />
      </FieldRow>
      <span className={sectionLabelStyle}>Equation</span>
      <BodyCodeBlock
        parts={parts}
        partId="code"
        code={equation.code}
        path={getDocumentUri("differential-equation", equation.id)}
        onChange={(code) =>
          updateDifferentialEquation({
            equationId: equation.id,
            update: { code },
          })
        }
      />
    </>
  );
};

export const CellBody: React.FC<{
  net: ActiveNetDefinition;
  cell: NotebookCell;
  parts: BodyPartContext;
}> = ({ net, cell, parts }) => {
  switch (cell.kind) {
    case "place":
      return <PlaceBody net={net} place={cell.place} parts={parts} />;
    case "transition":
      return (
        <TransitionBody net={net} transition={cell.transition} parts={parts} />
      );
    case "type":
      return <TypeBody color={cell.color} parts={parts} />;
    case "differentialEquation":
      return <EquationBody net={net} equation={cell.equation} parts={parts} />;
    case "parameter":
      return <ParameterBody parameter={cell.parameter} parts={parts} />;
  }
};
