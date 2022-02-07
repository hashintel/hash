import { flatMapTree } from "./util";

describe("flatMapTree", () => {
  it("can flatmap simple properties", () => {
    const test1 = [
      {
        rootId: "1",
        children: {
          relatesTo: { entityId: "id2" },
        },
      },
      {
        rootId: "2",
        children: {
          entityId: "xid1",
        },
      },
    ];

    const result = [];
    for (const block of test1) {
      result.push(
        ...flatMapTree(block, (node: any) => {
          return [node];
        }),
      );
    }

    expect(result).toMatchInlineSnapshot(`
Array [
  Object {
    "children": Object {
      "relatesTo": Object {
        "entityId": "id2",
      },
    },
    "rootId": "1",
  },
  "1",
  Object {
    "relatesTo": Object {
      "entityId": "id2",
    },
  },
  Object {
    "entityId": "id2",
  },
  "id2",
  Object {
    "children": Object {
      "entityId": "xid1",
    },
    "rootId": "2",
  },
  "2",
  Object {
    "entityId": "xid1",
  },
  "xid1",
]
`);
  });

  it("can flatmap simple properties", () => {
    const test1 = [
      {
        rootId: "1",
        children: ["one", "two"],
      },
      {
        rootId: "2",
        children: {
          entityId: "xid1",
          relatesTo: { entityId: "xid2", relatesTo: { entityId: "xid3" } },
        },
      },
    ];

    const result = [];
    for (const block of test1) {
      result.push(
        ...flatMapTree(block, (node: any) => {
          return [node];
        }),
      );
    }

    expect(result).toMatchInlineSnapshot(`
Array [
  Object {
    "children": Array [
      "one",
      "two",
    ],
    "rootId": "1",
  },
  "1",
  Array [
    "one",
    "two",
  ],
  "one",
  "two",
  Object {
    "children": Object {
      "entityId": "xid1",
      "relatesTo": Object {
        "entityId": "xid2",
        "relatesTo": Object {
          "entityId": "xid3",
        },
      },
    },
    "rootId": "2",
  },
  "2",
  Object {
    "entityId": "xid1",
    "relatesTo": Object {
      "entityId": "xid2",
      "relatesTo": Object {
        "entityId": "xid3",
      },
    },
  },
  "xid1",
  Object {
    "entityId": "xid2",
    "relatesTo": Object {
      "entityId": "xid3",
    },
  },
  "xid2",
  Object {
    "entityId": "xid3",
  },
  "xid3",
]
`);
  });
});
