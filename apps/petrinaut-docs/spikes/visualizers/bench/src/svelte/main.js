import { mount, flushSync } from "svelte";

import { installHarness } from "../harness.js";
import App from "./App.svelte";
import { tokens } from "./state.js";
installHarness({
  mount(el) {
    el.innerHTML = "";
    mount(App, { target: el });
    flushSync();
  },
  frame(next) {
    tokens.set(next);
    flushSync();
  },
});
