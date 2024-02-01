---
title: Simulation Parameters
slug: simulation/creating-simulations/configuration/basic-properties
objectId: aaf900cd-674f-4aa6-b575-21167ffd8b3a
description: >-
  Capture truths or assumptions about the state of your world which can easily
  be varied
---

# Simulation Parameters

## Defining simulation parameters as global variables

Simulation parameters defined as part of a simulation's `globals.json` file can be easily varied and subject to [experimentation](/docs/simulation/creating-simulations/experiments/). This makes globals an ideal place to define key assumptions about your simulated world.

If, for example, we wanted to cap the height of all trees in a [forest simulation](/@hash/forest), we might introduce the global variable `"maxTreeHeight"`. The `globals.json` file would contain something like:

```javascript
{
    "maxTreeHeight": 50,
    ...
}
```

The associated tree growth behavior would follow:

<Tabs>
<Tab title="JavaScript" >

```javascript
function behavior(state, context) {
  if (state.height + growth <= context.globals()["maxTreeHeight"]) {
    growtree();
  }
}
```

</Tab>

<Tab title="Python" >

```python
def behavior(state, context):
    if state['height'] + growth <= context.globals()['maxTreeHeight']):
        growtree()
```

</Tab>
</Tabs>

## Visual Globals

Parameters defined in `globals.json` can be viewed and modified either in code-form, or through hCore's visual interface. Click the _toggle visual globals_ button at the top right of the code editor pane to switch between these views.

![Toggle between edit and input of globals](https://cdn-us1.hash.ai/site/docs/kapture-2020-12-09-at-11.52.28.gif)

<Hint style="info">
By default a non-signed in viewer of a simulation will see and interact with the visual globals view.
</Hint>

The type of field input for a simulation parameter can be varied by adding a "schema" property to globals. Currently you can use schemas to specify these types of interfaces be displayed in the _visual globals_ interface:

- Color Picker
- Slider

### Color Picker

**globals.json**

```javascript

  {
    "<property_name>": "#ff0000",

    "schema": {
      "properties": {
        "<property_name>": {
          "type": "string",
          "enum": "colors"
        }
      }
    }
  }
```

![A color selector in the visual globals pane](https://cdn-us1.hash.ai/site/docs/screen-shot-2020-12-09-at-12.06.10-pm.png)

### Slider

```javascript
  {
    "<property_name>": 5,

    "schema": {
      "properties": {
        "<property_name>": {
          "type": "number",
          "minimum": 0,
          "maximum": 10,
          "multipleOf": 1
        }
      }
    }
  }
```

![Sliders for number parameters in the visual globals pane](https://cdn-us1.hash.ai/site/docs/image%20%2832%29.png)
