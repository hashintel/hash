import { use, useState } from "react";

import { SegmentedControl } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import {
  toggleTokenField,
  tokenFieldPlaces,
  transitionPartHolders,
} from "../../react/controller-prototype/controllers";
import { useControllers } from "../../react/controller-prototype/use-controllers";
import { SDCPNContext } from "../../react/state/sdcpn-context";
import { PlaceFieldRows } from "./controller-panel";
import { useFieldsView } from "./fields-view-flag";

const wrapperStyle = css({
  display: "flex",
  flexDirection: "column",
  flex: "[1]",
  minHeight: "[0]",
});

const segmentGroupContainerStyle = css({
  marginTop: "[8px]",
  marginBottom: "[8px]",
});

const fullWidthSegmentedControlStyle = css({
  "&&": { width: "full" },
});

const fieldsStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "3",
  paddingY: "2",
  fontSize: "sm",
  color: "neutral.s120",
});

const controllerHeadingStyle = css({
  fontSize: "xs",
  fontWeight: "medium",
  color: "neutral.s90",
});

const footerStyle = css({ fontSize: "sm", color: "neutral.s100" });

const FieldsView: React.FC<{ transitionId: string }> = ({ transitionId }) => {
  const { controllers, updateControllers } = useControllers();
  const { petriNetDefinition } = use(SDCPNContext);
  const holders = transitionPartHolders(controllers, transitionId, "results");
  const places = tokenFieldPlaces(petriNetDefinition, transitionId);

  return (
    <div className={fieldsStyle}>
      {holders.map(({ controller }) => {
        const lever = controller.levers.find(
          (candidate) =>
            candidate.kind === "tokenField" &&
            candidate.transitionId === transitionId,
        );
        return (
          <div key={controller.id} className={fieldsStyle}>
            {holders.length > 1 ? (
              <div className={controllerHeadingStyle}>{controller.name}</div>
            ) : null}
            {places.map((place) => (
              <PlaceFieldRows
                key={place.placeId}
                place={place}
                chosen={
                  lever?.kind === "tokenField"
                    ? lever.places.find(
                        (entry) => entry.placeId === place.placeId,
                      )?.elementIds ?? []
                    : []
                }
                onToggle={(elementId, on) =>
                  updateControllers((current) =>
                    current.map((candidate) =>
                      candidate.id === controller.id
                        ? toggleTokenField(
                            petriNetDefinition,
                            candidate,
                            transitionId,
                            place.placeId,
                            elementId,
                            on,
                            () => lever?.id ?? "",
                          )
                        : candidate,
                    ),
                  )
                }
              />
            ))}
          </div>
        );
      })}
      <div className={footerStyle}>Unticked fields come from the code.</div>
    </div>
  );
};

/**
 * Wraps the Transition Results code editor with a Fields | Code switch when
 * the prototype flag is on and a controller sets Token fields on the
 * transition. Otherwise it renders the editor as it is.
 */
export const FieldsCodeSwitch: React.FC<{
  transitionId: string;
  children: React.ReactNode;
}> = ({ transitionId, children }) => {
  const enabled = useFieldsView();
  const { controllers } = useControllers();
  const [view, setView] = useState<"fields" | "code">("fields");

  if (
    !enabled ||
    transitionPartHolders(controllers, transitionId, "results").length === 0
  ) {
    return children;
  }

  return (
    <div className={wrapperStyle}>
      <div className={segmentGroupContainerStyle}>
        <SegmentedControl
          size="sm"
          value={view}
          items={[
            { value: "fields", label: "Fields" },
            { value: "code", label: "Code" },
          ]}
          onChange={setView}
          className={fullWidthSegmentedControlStyle}
        />
      </div>
      {view === "fields" ? (
        <FieldsView transitionId={transitionId} />
      ) : (
        children
      )}
    </div>
  );
};
