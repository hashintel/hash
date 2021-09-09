---
description: Errors you may encounter and how to fix them
---

# Error reference

You may see a red error message pop up when running a simulation - here's some of the most common, and how to fix them.

<table class="docs-table">
  <thead>
    <tr>
      <th class="text-left">Error</th>
      <th class="text-left">Explanation</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td class="text-left">ReferenceError: behavior is not defined <em>or</em>
        <br />Can&#x2019;t find variable: behavior</td>
      <td class="text-left">
        <p>Every HASH behavior file must have a function signature with a function
          named behavior().</p>
        <p>If it is not properly defined, you&apos;ll see this error.</p>
      </td>
    </tr>
    <tr>
      <td class="text-left">ERROR running simulation: <code>[error]</code> did not match any variant
        of untagged enum OutboundMessage</td>
      <td class="text-left">All <a href="../../creating-simulations/agent-messages/">messages</a> must
        have a <code>to</code> and <code>type</code> field this error indicates the
        type is missing.</td>
    </tr>
    <tr>
      <td class="text-left">D is not a function.</td>
      <td class="text-left">Check <a href="../../creating-simulations/views/analysis/">analysis</a>.json
        - this can indicate you referenced an output that doesn&apos;t exist or
        used an incorrect operation.</td>
    </tr>
    <tr>
      <td class="text-left">Agent &quot;<code>[agent id]</code>&quot; doesn&apos;t have a position.</td>
      <td
      class="text-left">Many operations on agents require a physical location on the x,y plane
        for example searching for neighbors. This error will be thrown if there
        is no position defined for the agent.</td>
    </tr>
  </tbody>
</table>

We're expanding this list with more errors, explanations, and fixes. If you encounter an error that is unclear, [let us know](/discord).

