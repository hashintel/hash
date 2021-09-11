export const defineBlock = (meta, attrs) => ({
  ...attrs,
  selectable: false,
  group: "blockItem",
  attrs: {
    ...(attrs.attrs ?? {}),
    // @todo remove this
    properties: { default: {} },
    meta: { default: meta },
    entityId: { default: "" },
  },
});
