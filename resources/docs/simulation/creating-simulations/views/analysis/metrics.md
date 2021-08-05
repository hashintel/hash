# Metrics

Your first step is to define Metrics that you are interested in plotting. Each Metric is an output of your simulation, represented as an array of data. Metrics are defined as a series of Operations which transform your simulation data into an array of specific data, typically by filtering for specific agents, then retrieving a certain value from each agent. The available Operations are listed below.

<table class="docs-table">
  <thead>
    <tr>
      <th class="text-left">Operator Name</th>
      <th class="text-left">Additional Arguments</th>
      <th class="text-left">Operator Description</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td class="text-left"><code>&quot;filter&quot;</code>
      </td>
      <td class="text-left">
        <p><code>&quot;field&quot;</code>  <code>&quot;comparison&quot;</code>
        </p>
        <p><code>&quot;value&quot;</code>
        </p>
      </td>
      <td class="text-left">Filter the current output with the given <em>comparison</em> and <em>value</em> on
        the given <em>field</em> of each element</td>
    </tr>
    <tr>
      <td class="text-left"><code>&quot;count&quot;</code>
      </td>
      <td class="text-left">n/a</td>
      <td class="text-left">Count the number of agents in the current output</td>
    </tr>
    <tr>
      <td class="text-left"><code>&quot;get&quot;</code>
      </td>
      <td class="text-left"><code>&quot;field&quot;</code>
      </td>
      <td class="text-left">Retrieve the <em>field</em> value from each agent in the current output</td>
    </tr>
    <tr>
      <td class="text-left"><code>&quot;sum&quot;</code>
      </td>
      <td class="text-left">n/a</td>
      <td class="text-left">Sum over the elements of the current output</td>
    </tr>
    <tr>
      <td class="text-left"><code>&quot;min&quot;</code>
      </td>
      <td class="text-left">n/a</td>
      <td class="text-left">Return the minimum of the elements in the current output</td>
    </tr>
    <tr>
      <td class="text-left"><code>&quot;max&quot;</code>
      </td>
      <td class="text-left">n/a</td>
      <td class="text-left">Return the maximum of the elements in the current output</td>
    </tr>
    <tr>
      <td class="text-left"><code>&quot;mean&quot;</code>
      </td>
      <td class="text-left">n/a</td>
      <td class="text-left">Return the mean of the elements in the current output</td>
    </tr>
  </tbody>
</table>

‌

Many of these operations are aggregators: they will reduce the current output array to a single value.‌

Like many data pipelines you first filter your data to the set you're interested in, and then aggregate it into a final metric.‌

The Metrics Wizard will help you construct your metrics and fill in the appropriate parameters.​‌

![](https://gblobscdn.gitbook.com/assets%2F-M3CpctISatx3qXBSyvk%2F-MVWlyxFlxI_fI__mX_k%2F-MVXgDrVSHf54Fj5tFGZ%2Fimage.png?alt=media&token=8124f91d-c2c1-4d3c-9564-fcee83ca866b)

For example, if you have a collection of agents with an age attribute in your simulation, you might want to count the number over 50. You will chain together operations like so:​‌

![](https://gblobscdn.gitbook.com/assets%2F-M3CpctISatx3qXBSyvk%2F-MVSkob4T_EOZreFokxV%2F-MVSoOYFhg0C6tzucRYC%2Fimage.png?alt=media&token=fd6c62a5-aab8-476d-bb8b-b65fb4617ff3)

It's likely that the most common operation you'll use is "filter". You can filter with numeric, boolean, and string values. The valid comparisons are listed below:

| Comparison Name | Comparison Description |
| :--- | :--- |
| eq | Equal to \(===\) |
| neq | Not equal to \(!==\) |
| lt | Less than \(&lt;\) |
| lte | Less than or equal to \(&lt;=\) |
| gt | Greater than \(&gt;\) |
| gte | Greater than or equal to \(&gt;=\) |

