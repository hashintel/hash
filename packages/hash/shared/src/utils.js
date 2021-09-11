export const defineBlock = (meta, attrs) => ({
  ...attrs,
  selectable: false,
  group: "blockItem",
  attrs: {
    ...(attrs.attrs ?? {}),
    meta: { default: meta },
    entityId: { default: "" },
  },
});
