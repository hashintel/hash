export const defineBlock = (meta, attrs) => ({
  ...attrs,
  selectable: false,
  group: "blockItem",
  attrs: {
    ...(attrs.attrs ?? {}),
    props: { default: {} },
    meta: { default: meta },
    entityId: { default: "" },
    namespaceId: { default: "" },
    childEntityId: { default: null },
    childEntityNamespaceId: { default: null },
  },
});
