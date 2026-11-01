<script>
  import { tokens } from "./state.js";
  const COLORS = ["#e11", "#1a1", "#11e"];
</script>
<svg viewBox="0 0 1000 1000">
  {#each $tokens as t (t.id)}
    <circle cx={t.x} cy={t.y} r="3" fill={COLORS[t.kind]} />
  {/each}
</svg>
