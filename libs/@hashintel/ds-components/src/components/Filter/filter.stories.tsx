const StringOperators = [
  {
    key: "equals",
    label: "equals",
    input: { type: "string" },
    tooltip: "Aa case sensitive",
  },
  {
    key: "matches",
    label: "matches",
    input: { type: "string", placeholder: "Regex", pattern: "/.*/" },
  },
  {
    key: "contains",
    label: "contains",
    input: { type: "string", min: 5, max: 10 },
  },
];

const NumberOperators = [
  {
    key: "equalsNum",
    label: "equals",
    input: { type: "number" },
    tooltip: "Any number",
  },
  {
    key: "gt",
    label: "greater than",
    input: { type: "float", min: 0, max: 99999, placeholder: "Float" },
  },
  { key: "power", label: "is power of 10", input: { type: "int", step: 10 } },
];

type BooleanFilter = [
  { key: "true"; label: "is true"; input: null },
  { key: "false"; label: "is false"; input: null },
];
