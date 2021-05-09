---
description: Errors and what they mean
---

# Error Reference & Debugging

{% embed url="https://youtu.be/lqEZk0Xp51U" caption="Debugging tutorial" %}

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
        <p></p>
      </td>
    </tr>
    <tr>
      <td style="text-align:left">ERROR running simulation: <code>[error]</code> did not match any variant
        of untagged enum OutboundMessage</td>
      <td style="text-align:left">All <a href="../creating-simulations/agent-messages/">messages</a> must
        have a <code>to</code> and <code>type </code>field this error indicates the
        type is missing.</td>
    </tr>
    <tr>
      <td style="text-align:left">
        <p>D is not a function.</p>
        <p></p>
      </td>
      <td style="text-align:left">Check <a href="../creating-simulations/views/analysis/">analysis</a>.json
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

### Debugging

A few tips for debugging errors:

* You can use `console.log()` in JavaScript behaviors or `print()` in Python behaviors to output the value of a variable or an expression to the developer console \(**Ctrl+Shift+J** on Windows, or **Cmd+Option+J** on Mac\).
* The Raw Output panel displays the full state of your simulation, which can be useful for figuring out what's going on. Keep in mind though it generates it for the last completed time-step - if your simulation has an error in the middle of a time-step the Raw Output panel will only show you the state that you entered the time-step with.
* Often it's easiest to debug simulations with the bare minimum number of agents, to make it easier to track what's going on. Try reducing the number you create to simplify.

