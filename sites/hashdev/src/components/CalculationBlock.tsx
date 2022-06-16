import { MockBlockDock } from "mock-block-dock";

const CalcBlock = require("calculation-block").default;

// eslint-disable-next-line import/no-default-export
export default () => (
  <>
    <div
      style={{
        width: "100%",
        overflowX: "scroll",
        marginLeft: "auto",
        marginRight: "auto",
      }}
    >
      <MockBlockDock
        blockDefinition={{ ReactComponent: CalcBlock }}
        blockEntity={{
          entityId: "calculation-block-1",
          entityTypeId: "calculation-block",
          properties: {
            cells: [
              [["A", 1], "Employees"],
              [["B", 1], "Count"],
              [["C", 1], "Average"],
              [["A", 2], "=count()"],
              [["B", 2], "=sum(employees)"],
              [["C", 2], "=B2/A2"],
              [["A", 3], "=count()"],
            ],
            rows: [
              [1, null],
              [2, "Company"],
              [3, "Person"],
            ],
          },
        }}
      />
    </div>
    <p style={{ textAlign: "center", marginTop: 0 }}>
      <small>The resulting calculation block. Play around with it!</small>
    </p>
  </>
);
