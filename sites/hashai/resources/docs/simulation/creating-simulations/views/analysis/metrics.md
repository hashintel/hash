---
title: Metrics
slug: simulation/creating-simulations/views/analysis/metrics
objectId: 28ad0ee6-385d-4c3d-9bd8-71bb5e7f239b
---

# Metrics

Your first step is to define Metrics that you are interested in plotting. Each Metric is an output of your simulation, represented as an array of data. Metrics are defined as a series of Operations which transform your simulation data into an array of specific data, typically by filtering for specific agents, then retrieving a certain value from each agent. The available Operations are listed below.

<table className="docs-table">
  <thead>
    <tr>
      <th className="text-left">Operator Name</th>
      <th className="text-left">Additional Arguments</th>
      <th className="text-left">Operator Description</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td className="text-left"><code>&quot;filter&quot;</code>
      </td>
      <td className="text-left">
        <p><code>&quot;field&quot;</code>  <code>&quot;comparison&quot;</code>
        </p>
        <p><code>&quot;value&quot;</code>
        </p>
      </td>
      <td className="text-left">Filter the current output with the given <em>comparison</em> and <em>value</em> on
        the given <em>field</em> of each element</td>
    </tr>
    <tr>
      <td className="text-left"><code>&quot;count&quot;</code>
      </td>
      <td className="text-left">n/a</td>
      <td className="text-left">Count the number of agents in the current output</td>
    </tr>
    <tr>
      <td className="text-left"><code>&quot;get&quot;</code>
      </td>
      <td className="text-left"><code>&quot;field&quot;</code>
      </td>
      <td className="text-left">Retrieve the <em>field</em> value from each agent in the current output</td>
    </tr>
    <tr>
      <td className="text-left"><code>&quot;sum&quot;</code>
      </td>
      <td className="text-left">n/a</td>
      <td className="text-left">Sum over the elements of the current output</td>
    </tr>
    <tr>
      <td className="text-left"><code>&quot;min&quot;</code>
      </td>
      <td className="text-left">n/a</td>
      <td className="text-left">Return the minimum of the elements in the current output</td>
    </tr>
    <tr>
      <td className="text-left"><code>&quot;max&quot;</code>
      </td>
      <td className="text-left">n/a</td>
      <td className="text-left">Return the maximum of the elements in the current output</td>
    </tr>
    <tr>
      <td className="text-left"><code>&quot;mean&quot;</code>
      </td>
      <td className="text-left">n/a</td>
      <td className="text-left">Return the mean of the elements in the current output</td>
    </tr>
  </tbody>
</table>

Many of these operations are aggregators: they will reduce the current output array to a single value.

Like many data pipelines you first filter your data to the set you're interested in, and then aggregate it into a final metric.

The Metrics Wizard will help you construct your metrics and fill in the appropriate parameters.

![](https://cdn-us1.hash.ai/site/docs/analysis-metrics-1.png)

For example, if you have a collection of agents with an age attribute in your simulation, you might want to count the number over 50. You will chain together operations like so:

![](https://cdn-us1.hash.ai/site/docs/analysis-metrics-2.png)

It's likely that the most common operation you'll use is "filter". You can filter with numeric, boolean, and string values. The valid comparisons are listed below:

<!-- prettier-ignore -->
| Comparison Name | Comparison Description |
| :--- | :--- |
| eq | Equal to \(===\) |
| neq | Not equal to \(!==\) |
| lt | Less than \(&lt;\) |
| lte | Less than or equal to \(&lt;=\) |
| gt | Greater than \(&gt;\) |
| gte | Greater than or equal to \(&gt;=\) |
