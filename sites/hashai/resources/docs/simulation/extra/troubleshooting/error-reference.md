---
title: Error reference
slug: simulation/extra/troubleshooting/error-reference
objectId: 90dca8e5-ac3b-46d8-a0e9-e4224c2b953c
description: Errors you may encounter and how to fix them
---

# Error reference

You may see a red error message pop up when running a simulation - here's some of the most common, and how to fix them.

<table className="docs-table">
  <thead>
    <tr>
      <th className="text-left">Error</th>
      <th className="text-left">Explanation</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td className="text-left">ReferenceError: behavior is not defined <em>or</em>
        <br />Can&#x2019;t find variable: behavior</td>
      <td className="text-left">
        Every HASH behavior file must have a function signature with a function
          named behavior().
        <br />
        If it is not properly defined, you&apos;ll see this error.
      </td>
    </tr>
    <tr>
      <td className="text-left">ERROR running simulation: <code>[error]</code> did not match any variant
        of untagged enum OutboundMessage</td>
      <td className="text-left">All <a href="/docs/simulation/creating-simulations/agent-messages/">messages</a> must
        have a <code>to</code> and <code>type</code> field this error indicates the
        type is missing.</td>
    </tr>
    <tr>
      <td className="text-left">D is not a function.</td>
      <td className="text-left">Check <a href="/docs/simulation/creating-simulations/views/analysis/">analysis</a>.json
        - this can indicate you referenced an output that doesn&apos;t exist or
        used an incorrect operation.</td>
    </tr>
    <tr>
      <td className="text-left">Agent &quot;<code>[agent id]</code>&quot; doesn&apos;t have a position.</td>
      <td
      className="text-left">Many operations on agents require a physical location on the x,y plane
        for example searching for neighbors. This error will be thrown if there
        is no position defined for the agent.</td>
    </tr>
  </tbody>
</table>

We're expanding this list with more errors, explanations, and fixes. If you encounter an error that is unclear, [let us know](/discord).
