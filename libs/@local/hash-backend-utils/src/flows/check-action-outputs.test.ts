import { describe, expect, it } from "vitest";

import { StatusCode } from "@local/status";

import { checkActionOutputs } from "./check-action-outputs.js";

import type { FlowActionActivity } from "./action-types.js";
import type { StepInput } from "@local/hash-isomorphic-utils/flows/types";
import type { Status } from "@local/status";

const inputs: StepInput[] = [
  { inputName: "items", payload: { kind: "Number", value: [1, 2, 3] } },
];

const nonMatching = {
  outputName: "nonMatching",
  payload: { kind: "Number", value: [2, 3] },
};

const checkFilterList = (response: Status<object>) =>
  checkActionOutputs<"filterList">({
    filterListAction: (() => Promise.resolve(response)) as FlowActionActivity,
  }).filterListAction({ inputs });

describe("checkActionOutputs", () => {
  it("passes valid outputs through", async () => {
    const response = {
      code: StatusCode.Ok,
      contents: [
        {
          outputs: [
            { outputName: "matching", payload: { kind: "Number", value: [1] } },
            nonMatching,
          ],
        },
      ],
    };

    await expect(checkFilterList(response)).resolves.toBe(response);
  });

  it("fails an action whose outputs don't fit its definition, saying what's wrong", async () => {
    await expect(
      checkFilterList({
        code: StatusCode.Ok,
        contents: [
          {
            outputs: [
              { outputName: "matching", payload: { kind: "Number", value: 1 } },
              nonMatching,
            ],
          },
        ],
      }),
    ).resolves.toEqual({
      code: StatusCode.Internal,
      message: `Action filterList returned an invalid output "matching": Expected an array`,
      contents: [],
    });

    await expect(
      checkFilterList({ code: StatusCode.Ok, contents: [] }),
    ).resolves.toEqual({
      code: StatusCode.Internal,
      message: `Action filterList didn't return its required output "matching"`,
      contents: [],
    });
  });

  it("passes an error status through", async () => {
    const response = {
      code: StatusCode.InvalidArgument,
      message: "Bad input",
      contents: [],
    };

    await expect(checkFilterList(response)).resolves.toBe(response);
  });

  it("passes the activity its parameters", async () => {
    const received: unknown[] = [];

    const { filterListAction } = checkActionOutputs<"filterList">({
      filterListAction: (params: unknown) => {
        received.push(params);
        return Promise.resolve({
          code: StatusCode.InvalidArgument,
          contents: [],
        });
      },
    });

    await filterListAction({ inputs, extra: true } as { inputs: StepInput[] });

    expect(received).toEqual([{ inputs, extra: true }]);
  });
});
