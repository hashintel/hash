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
      [
        {
          "children": {
            "relatesTo": {
              "entityId": "id2",
            },
          },
          "rootId": "1",
        },
        "1",
        {
          "relatesTo": {
            "entityId": "id2",
          },
        },
        {
          "entityId": "id2",
        },
        "id2",
        {
          "children": {
            "entityId": "xid1",
          },
          "rootId": "2",
        },
        "2",
        {
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
      [
        {
          "children": [
            "one",
            "two",
          ],
          "rootId": "1",
        },
        "1",
        [
          "one",
          "two",
        ],
        "one",
        "two",
        {
          "children": {
            "entityId": "xid1",
            "relatesTo": {
              "entityId": "xid2",
              "relatesTo": {
                "entityId": "xid3",
              },
            },
          },
          "rootId": "2",
        },
        "2",
        {
          "entityId": "xid1",
          "relatesTo": {
            "entityId": "xid2",
            "relatesTo": {
              "entityId": "xid3",
            },
          },
        },
        "xid1",
        {
          "entityId": "xid2",
          "relatesTo": {
            "entityId": "xid3",
          },
        },
        "xid2",
        {
          "entityId": "xid3",
        },
        "xid3",
      ]
    `);
  });
});
