---
title: Create a Simulation Dashboard
slug: simulation/tutorials/create-a-simulation-dashboard
objectId: c565e7db-89db-4bbb-b75a-9a954ef87a6b
---

# Create a Simulation Dashboard

Simulations are powerful ways to model the world, but they won't do any good if they're not used! It's important to build presentations of simulations in anticipation of how the end user will want to interact with it, helping them to explore the parameters of the simulation and derive insights.

With HASH, you can take advantage of the rich web ecosystem to create complex dashboards that are paired with a simulation. HASH supports web messaging protocols that lets you control a simulation and read its state from external applications.

In this tutorial we'll embed an example simulation into a webpage and add buttons and charts to create an interactive dashboard. You can embed it in any page: to make it easy we'll create an example using a free to use code editor like [REPL.it](http://repl.it), but you could create this on your local machine or anywhere you can run JavaScript and HTML.

![](https://cdn-us1.hash.ai/site/docs/screely-1621891128219.png)

## Communicating with a HASH simulation

Moving data into and out of a simulation is as simple as passing messages between a simulation and the host application \(pro tip: everything in HASH is about [message passing](/docs/simulation/creating-simulations/agent-messages)\).

In this case, you are passing messages between the webpage and the iFrame - the messages will be carried over the [postMessage](https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage) channel.

There are three types of messages we'll send:

- updateFile: changes a file in the simulation
  - id: &lt;uuid&gt;
  - type: "updateFile"
  - file: the file name to update
  - contents: the new contents of the file
- requestState: gets the output state from a simulation
  - id: &lt;uuid&gt;
  - type: "sendState"
- resetAndRun: resets the embedded simulation and reruns it
  - id: &lt;uuid&gt;
  - type: "resetAndRun"

_There's a fourth, initialize, that will cause hCore to send updates to the webpage for every file changed, but we're not going to use that._

<Hint style="info">
[Read the hCore Messaging API docs for more information](/docs/simulation/api/hcore)
</Hint>

Both types of messages contain an id and message type. For the ID, we recommend using a UUID. In the example we've included a sample function for generating UUIDs in JavaScript.

## Embed the simulation

For our dashboard, we're going to embed the [Wildfires simulation](https://core.hash.ai/@hash/wildfires-regrowth/9.7.0). Open the simulation and click the share button in the top right. Click the embed tab and copy the code to the clipboard.

![Click the share button and then copy the iframe code by clicking 'copy to clipboard'](https://cdn-us1.hash.ai/site/docs/screely-1621889688418.png)

All HASH simulations are embeddable as iFrames. You can add an iFrame as a block in the `<body>` of the website. We'll add an `id` property to the iFrame with the value "sim" to make it easier to reference.

```markup
<body>
    <div className="simulation">
        <iframe id="sim"
            src="https://core.hash.ai/embed.html?project=%40hash%2Fwildfires-regrowth&ref=stable"
            width="700" height="400" frameborder="0" scrolling="auto"></iframe>
    </div>
</body>
```

## Add Buttons

Like a lot of dashboards, a key feature to implement is letting users set parameters from the web page. For instance, if we have specific scenarios for a user to run, then it might be easiest to do that in an embedded application where the user can set the parameters with one click.

So we'll add buttons:

```markup
<button id="scenario_one" onclick="setGlobals('one')">Scenario 1</button>
<button id="scenario_two" onclick="setGlobals('two')">Scenario 2</button>
```

Each button will be associated with a function, `setGlobals()`, that will trigger the **globals.json** file to update.

Next, let's define the different scenarios. We'll explore combinations of parameters that determine the likelihood of a lightning strike and the likelihood of a tree regrowing. The first scenario will set the parameters for `lightningChance`and `regrowthChance` to 0.01 and 0.1, and the second to 0.0001 and 0.0001.

We'll do this in a new file called `script.js`.

```javascript
// script.js

const scenarios = {
  one: {
    forestColor: "green",
    fireColor: "red",
    emberColor: "yellow",
    lightningColor: "silver",
    forestHeight: 10,
    emberHeight: 0,
    lightningChance: 0.01,
    regrowthChance: 0.1,
    wildfire_count: 20,
    topology: {
      x_bounds: [-20, 20],
      y_bounds: [-20, 20],
      search_radius: 1,
    },
  },
  two: {
    forestColor: "green",
    fireColor: "red",
    emberColor: "yellow",
    lightningColor: "silver",
    forestHeight: 10,
    emberHeight: 0,
    lightningChance: 0.1,
    regrowthChance: 0.01,
    wildfire_count: 20,
    topology: {
      x_bounds: [-20, 20],
      y_bounds: [-20, 20],
      search_radius: 1,
    },
  },
};
```

When the user clicks scenario 1, we want the globals file to have the data of the value of the dictionary "one". And when the user clicks scenario 2, the data from two.

We'll write the `setGlobals()` function that will post a message to the iframe telling the simulation to update `globals.json` with the value of the corresponding scenario.

Additionally, we'll have it `resetAndRun` the simulation, so that when you click a button the simulation starts running with the new parameters.

```javascript
// script.js

function setGlobals(ind) {
  document.getElementById("sim").contentWindow.postMessage(
    {
      id: generateUUID(),
      type: "updateFile",
      file: "globals.json",
      contents: JSON.stringify(scenarios[ind]),
    },
    "*",
  );
  document.getElementById("sim").contentWindow.postMessage(
    {
      id: generateUUID(),
      type: "resetAndRun",
    },
    "*",
  );
}
```

<Hint style="info">
[generateUUID\(\)](https://replit.com/@BenGoldhaber1/DamagedCircularDimension#script.js:1:17) is a helper function we've added to create UUIDs to pass in the function call. Feel free to use whatever UUID generating library you'd like.
</Hint>

Now try clicking the scenario 1 button, and then scroll down to the corresponding lightning and regrowth parameters \(if you're following along in repl.it click the play button at the top first to reload the generated webpage with the changes we've made\). You'll see that it's been updated to match the value of the first scenario.

<Hint style="info">
If you refresh the webpage, the globals file will return to the starting condition. For any embedded simulation that's view only, the changes only persist for the current session.
</Hint>

## Reading State

There are a lot of potential applications for reading the state of a simulation. In this case we're going to use it to power a custom heatmap - appropriate for a wildfire simulation!

We'll create a function that will request the state of the simulation.

```javascript
// script.js

function getState() {
  document
    .getElementById("sim")
    .contentWindow.postMessage({ id: generateUUID(), type: "sendState" }, "*");
}
```

This will return an object with the current state of the simulation, including the state on all the previous timesteps.

However, we've only only added the send message function. We also need a function that will handle the returned state data. For that, we can use an [event handler](https://developer.mozilla.org/en-US/docs/Web/Events/Event_handlers).

```javascript
// script.js
function eventHandler(event) {
  if (event.data.type == "state") {
    console.log({ state: event.data.contents });
    //do something
  }
}

window.addEventListener("message", eventHandler);
```

We'll want to store the state data in a variable that we can then provide to a visualization library. We just want the final step, so we'll save that on a global variable called stepsData.

```javascript
// script.js

var stateData = [];

function eventHandler(event) {
  if (event.data.type == "state") {
    stateData = event.data.contents.steps[event.data.contents.steps.length - 1];
  }
}

window.addEventListener("message", eventHandler);
```

We can now parse the steps and add a custom visualization to the dashboard. Using the [simple-heatmap.js](https://github.com/mourner/simpleheat) library, we can attach a visualization to a canvas element. Download the simpleheat.js file and add it to your project.

To use the library, and many others like it, the key is to filter the state data to only the elements we want. Let's write a helper function that filters for agents that are on fire and store their \[x,y\] position.

```javascript
// script.js

function parseFire(state) {
  return state.map(p => {
    if (p.color == "yellow") {
      return [10*(p.position[0] + 20), 10*(p.position[1] + 20), 0.5]
    } else {
      return [10*(p.position[0] + 20), 10*(p.position[1] + 20), 0]
    }
  }
)
```

We're checking if an agent is yellow, which would indicate they're on fire; if so we assign them a color value of 0.5, otherwise 0. We also transform the positions to better visualize the positions on the graph.

So now our full eventHandler will look like this:

```javascript
// script.js

function eventHandler(event) {
  if (event.data.type == "state") {
    stateData = parseFire(
      event.data.contents.steps[event.data.contents.steps.length - 1],
    );
  }
}

window.addEventListener("message", eventHandler);
```

Now we've got all the pieces in place, we just need to start requesting the data from HASH. We're going to add a simple polling function to get the data - for simplicity we'll use `setTimeout()`.

```markup
// index.html

<script>
var heat = simpleheat("canvas");

function redrawHeatMap() {
  heat.clear();
  heat.data(stateData).draw();
 }

function poll() {
  getState();
  redrawHeatMap();
  //poll every second
  setTimeout(poll, 1000);
}

setTimeout(poll, 1000);
</script>
```

## Running the Dashboard

You can see a [completed version of the dashboard here](https://DamagedCircularDimension.bengoldhaber1.repl.co). As soon as you run the simulation it will update the heatmap every five seconds. Click a scenario button and then reset/run the simulation to reload the simulations with the new parameters.

[You can see the completed files, and fork and modify the REPL, here.](https://replit.com/@BenGoldhaber1/DamagedCircularDimension)
