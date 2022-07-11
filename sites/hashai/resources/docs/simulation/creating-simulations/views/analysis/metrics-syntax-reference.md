---
title: Metrics Syntax Reference
slug: simulation/creating-simulations/views/analysis/metrics-syntax-reference
objectId: 909dde86-3681-4653-be0e-105c79ed564f
---

# Metrics Syntax Reference

We recommend using hCore's fully featured wizards to define metrics and generate plots. If you would like to define them manually for any reason, you can reference the below for an explanation of the structure and syntax of the **analysis.json** file.

The **analysis.json** file contains two items within it: an "outputs" object and a "plots" list.

## Metrics

Metrics are defined as an object collection of JSON objects of the form:

```javascript
"outputs": {
    "metric_1": [
        {
            operation
        },
        {
            operation
        }
        ...
    ],
    "metric_2": [
    ...
    ]
}
```

The “metric” is referenced by plot definitions, and will correspond to an array of data \(or array of arrays\). The "operations" are objects corresponding to those described in the [Analysis](/docs/simulation/creating-simulations/views/analysis) page, with all of the same fields that are described there. Chaining operations works identically to the wizard.

Operations must have an `"op"` field which designates their type. Some operations have additional arguments. The valid types and additional arguments are listed below:

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

For example, if you have a collection of agents with an age attribute, you might want to count the number over age 50. You would chain together operations like so:

```javascript
"outputs": {
   "over_fifty": [
   {
       "op": "filter",
       "field": "age",
       "comparison": "gte",
       "value": "50"
     },
     { "op": "count"}
   ],
   ...
}
```

## Plots

The "plots" list contains objects which define the different plots that visualize the outputs. The basic configuration of a plot includes a title, data, type, layout, and position field:

```javascript
  "plots": [{
     "title": "title",
     "layout": {
       "width": "100%", // % of analysis view width
       "height": "50%" // % of analysis view height
     },
     "position": {
     //top left corner of plot
       "x": "0%",
       "y": "0%"
     },
     //type of chart
     "type": "timeseries", // "histogram", "barplot", etc...
     "data": [
       {
         "y": "component_1",
         "name": "component_1_name"
         // ...
       },
       {
         "y": "component_2_name",
         "name": "component_2_name"
         //...
       {
     ]
   },
   //...
   ]
```

By default the x-axis represents the step of the simulation. You can use line, bar, or area charts, among others.

As a shortcut you may replace the "data" and "type" field with a "timeseries" array. Any outputs you place in the array will be plotted as lines.

```javascript
"plots": [{
     "title": "title",
     "layout": { "width": "100%", "height": "50%" },
     "position": { "x": "0%", "y": "0%" },
     // Timeseries shortcut
     "timeseries": ["timeseries1", "timeseries2"]
}]
```

HASH uses Plotly behind the scenes to render charts and graphs. As such, the platform supports any valid value it supports for layout, type, and data as [documented in their API](https://plotly.com/javascript/reference/).

## Examples

Below are a few snippets of outputs and plots.

### Model Market

[Link to Simulation](https://core.hash.ai/@hash/model-market/4.4.1)

```javascript
{
   "outputs":{
      "recent_sales":[
         {
            "op":"filter",
            "field":"color",
            "comparison":"eq",
            "value":"green"
         },
         {
            "op":"count"
         }
      ],
      "no_recent_sales":[
         {
            "op":"filter",
            "field":"color",
            "comparison":"eq",
            "value":"skyblue"
         },
         {
            "op":"count"
         }
      ]
   },
   "plots":[
      {
         "title":"Shop Status",
         "timeseries":[
            "no_recent_sales",
            "recent_sales",
            "closed"
         ],
         "layout":{
            "width":"100%",
            "height":"40%"
         },
         "position":{
            "x":"0%",
            "y":"0%"
         }
      }
   ]
}
```

### Civil Unrest

```javascript
{
  "outputs": {
    "active": [
      {
        "op": "filter",
        "field": "active",
        "comparison": "eq",
        "value": true
      },
      { "op": "count" }
    ],
    "arrested": [
      {
        "op": "filter",
        "field": "jail_time",
        "comparison": "gt",
        "value": 0
      },
      { "op": "count" }
    ]
  },
  "plots": [
    {
      "title": "Active agents",
      "timeseries": ["active"],
      "layout": { "width": "100%", "height": "33%"},
      "position": { "x": "0%", "y": "0%"}
    },
    {
      "title": "Arrested agents",
      "timeseries": ["arrested"],
      "layout": { "width": "100%", "height": "33%"},
      "position": { "x": "0%", "y": "68%"}
    },
    {
      "title": "Active Agents Histogram",
      "layout": { "width": "100%", "height": "33%" },
      "position": { "x": "0%", "y": "34%" },
      "type": "histogram",
      "data": [
        {
          "x": "active"
        }
      ]
    }
  ]
}
```
