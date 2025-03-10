import { createBase, disableRules } from "@local/eslint/deprecated";

export default [...createBase(import.meta.dirname), ...disableRules([])];
