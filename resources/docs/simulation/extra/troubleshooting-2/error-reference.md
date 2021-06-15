---
description: Errors you may encounter and how to fix them
---

# Error reference

You may see a red error message pop up when running a simulation - here's some of the most common, and how to fix them.

<table>
  <thead>
    <tr>
      <th style="text-align:left">Error</th>
      <th style="text-align:left">Explanation</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td style="text-align:left">ReferenceError: behavior is not defined <em>or</em>
        <br />Can&#x2019;t find variable: behavior</td>
      <td style="text-align:left">
        <p>Every HASH behavior file must have a function signature with a function
          named behavior().</p>
        <p>If it is not properly defined, you&apos;ll see this error.</p>
      </td>
    </tr>
    <tr>
      <td style="text-align:left">ERROR running simulation: <code>[error]</code> did not match any variant
        of untagged enum OutboundMessage</td>
      <td style="text-align:left">All <a href="../../creating-simulations/agent-messages/">messages</a> must
        have a <code>to</code> and <code>type</code> field this error indicates the
        type is missing.</td>
    </tr>
    <tr>
      <td style="text-align:left">D is not a function.</td>
      <td style="text-align:left">Check <a href="../../creating-simulations/views/analysis/">analysis</a>.json
        - this can indicate you referenced an output that doesn&apos;t exist or
        used an incorrect operation.</td>
    </tr>
    <tr>
      <td style="text-align:left">Agent &quot;<code>[agent id]</code>&quot; doesn&apos;t have a position.</td>
      <td
      style="text-align:left">Many operations on agents require a physical location on the x,y plane
        for example searching for neighbors. This error will be thrown if there
        is no position defined for the agent.</td>
    </tr>
  </tbody>
</table>

We're expanding this list with more errors, explanations, and fixes. If you encounter an error that is unclear, [let us know](https://hashpublic.slack.com/archives/C0151PYN1T4).

