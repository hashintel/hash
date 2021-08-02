# Init

When using `init.js` or `init.py` to initialize your simulation, these standard library functions can help you easily initialize agents in predefined patterns.

## scatter\(count, topology, template\)

Returns an array of agents at random positions within the bounds defined in `topology`. Agents are generated as copies of the `template` if you pass an object, or as the return value if you pass a function.

<Tabs>
{% tab title="init.js" %}
```javascript
const init = (context) => {
  // You can define the topology object here or in globals.json
  const topology = context.globals().topology;

  // Define agents without a position, since the scatter() function
  // will assign random positions
  const template = {
    "behaviors": ["move.js"],
    "color": "green"
  }

  // You can also pass a function instead of an object. This allows your agents
  // to initialize certain properties stochastically
  const templateFunction = () => ({
    "behaviors": ["move.js"],
    "color": Math.random() > 0.5 ? "green" : "blue"
  })

  // Generate the randomly scattered agents
  const agents = hstd.init.scatter(100, topology, template);
  const agentsFromFunction = hstd.init.scatter(100, topology, templateFunction);

  return agents;
}
```
</Tab>

{% tab title="globals.json" %}
```javascript
{
  "topology": {
    "x_bounds": [0, 20],
    "y_bounds": [-10, 15]
  }
}
```
</Tab>
</Tabs>

## stack\(count, template\)

Returns an array of agents generated from the `template`. Agents are generated as copies of the `template` if you pass an object, or as the return value if you pass a function.

```javascript
const init = (context) => {
  const template = {
    "behaviors": ["move.js"],
    "position": [2, 10, 0],
    "color": "green"
  }

  // You can also pass a function instead of an object. This allows your agents
  // to initialize certain properties stochastically
  const templateFunction = () => ({
    "behaviors": ["move.js"],
    "position": [2, 10, 0],
    "color": Math.random() > 0.5 ? "green" : "blue"
  })

  // Generate the randomly scattered agents
  const agents = hstd.init.stack(100, template);
  const agentsFromFunction = hstd.init.stack(100, templateFunction);

  return agents;
}
```

## grid\(topology, template\)

Returns an array of agents occupying every integer location within the bounds defined in `topology`. Agents are generated as copies of the `template` if you pass an object, or as the return value if you pass a function.

<Tabs>
{% tab title="init.js" %}
```javascript
const init = (context) => {
  // You can define the topology object here or in globals.json
  const topology = context.globals().topology;

  // Define agents without a position, since the grid() function
  // will assign positions
  const template = {
    "behaviors": ["move.js"],
    "color": "green"
  }

  // You can also pass a function instead of an object. This allows your agents
  // to initialize certain properties stochastically
  const templateFunction = () => ({
    "behaviors": ["move.js"],
    "color": Math.random() > 0.5 ? "green" : "blue"
  })

  // Generate the grid of agents
  const agents = hstd.init.grid(topology, template);
  const agentsFromFunction = hstd.init.grid(topology, templateFunction);

  return agents;
}
```
</Tab>

{% tab title="globals.json" %}
```javascript
{
  "topology": {
    "x_bounds": [0, 20],
    "y_bounds": [-10, 15]
  }
}
```
</Tab>
</Tabs>

## createLayout\(layout, templates, offset\)

Returns an array of agents based on a specified `layout` and set of `templates`. The `layout` file must be a csv mapping agent types to initial positions. The `templates` allow the function to determine the definition of each agent type. You can optionally specify a position `offset`.

<Tabs>
{% tab title="init.js" %}
```javascript
const init = (context) => {
    const layout = context.data()["/layout_data.csv"];

    // Note that templates don't have position, since that is assigned
    // based on the layout file
    const templates = {
        "c": {
          "agent_name": "crane",
          "behaviors": ["crane.js"]
        },
        "f": {
          "agent_name": "forklift",
          "behaviors": ["move.js", "lift.js"]
        },
        "w": {
          "agent_name": "wall",
          "color": "black"
        }
    };

    // Optional position offset
    const offset = [5, 5, 0];

    const agents = hstd.init.createLayout(layout, templates, offset);
    return agents;
}
```
</Tab>

{% tab title="layout\_data.csv" %}
```text
w,,,,,
w,,f,,,
w,,,,,
w,w,w,c,w,w
w,,,,,
w,,f,,,
```
</Tab>
</Tabs>

