export const defineBlock = (meta, attrs) => ({
  ...attrs,
  selectable: false,
  group: "blockItem",
  attrs: {
    ...(attrs.attrs ?? {}),
    properties: { default: {} },
    meta: { default: meta },
    entityId: { default: "" },
    accountId: { default: "" },
    childEntityId: { default: null },
    childEntityAccountId: { default: null },
  },
});
