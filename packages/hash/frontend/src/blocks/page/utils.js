export const defineBlock = (meta, attrs) => ({
  ...attrs,
  selectable: false,
  group: "blockItem",
  attrs: {
    ...(attrs.attrs ?? {}),
    props: { default: {} },
    meta: { default: meta },
    entityId: { default: "" },
    childEntityId: { default: null },
  },
});
