# Agent Initialization

Now, open up init.json. This is where we will be writing our **\*\*\[**agent creator**\]\(**[https://docs.hash.ai/core/anatomy-of-an-agent/initial-state](https://docs.hash.ai/core/anatomy-of-an-agent/initial-state)**\) \*\***that will generate all our simulation agents. First, generate the Customer agents.

## Customers

1. Look at the lower left of screen and locate the Add to Simulation sidebar. 
2. Click on the search bar located under the title and type “Create grids”.
3. Select the **Create Grids** result and choose Add to Simulation.
4. Repeat steps 2-3 for **Create Agents** and **Remove Self**.

Customers begin evenly distributed in a grid across the environment. Thanks to HASH’s published behavior feature, we can do this easily by adding those three behaviors to our creator agent:

* **`@hash/create-grids/create_grids.js`** - populates our creator’s `agents` field with Customer agents we define in our `grid_templates` field. 
* **`@hash/create-agents/create_agents.js`**- creates the Customers in the model environment.
* **`@hash/remove-self/remove_self.js`** - removes the creator agent from the simulation after all agents have been initialized.

{% code title="init.json" %}
```javascript
[
  {
    "behaviors": [
      "@hash/create-grids/create_grids.js",
      "@hash/create-agents/create_agents.js",
      "@hash/remove-self/remove_self.js"
    ],
    "agents": {},
    "grid_templates": [
      {
        "template_name": "grid",
        "height": 1,
        "rgb": [
          255,
          255,
          255
        ],
        "behaviors": [
          "customer.js"
        ]
      }
    ]
  }
]
```
{% endcode %}

Before we can successfully initialize the Customers defined under `grid_templates`, we need to create the `customer.js` behavior. Don’t worry about writing the behavior at the moment, we only need to create the file. Select the new file icon above the Files Sidebar in the top left and create customer.js.

Now click Reset and then run your simulation for two time steps with the **+1** button at the bottom of the 3D Viewer. You should see a grid of white agents!

![Initial Grid of Agents](../../.gitbook/assets/screen-shot-2020-12-17-at-10.38.46-am.png)

## Businesses

Now to create Business agents:

1. Add the published behavior **Create Scatters** to your Project.
2. Create two new files - `business.js` and `update_businesses.js`.
3. Add the `scatter_templates` property and two behaviors to the creator agent
   1. **`@hash/create-scatters/create_scatters.js`**
   2. **`update_businesses.js`**

{% code title="init.json" %}
```javascript
[
  {
    "behaviors": [
      "@hash/create-grids/create_grids.js",
      "@hash/create-scatters/create_scatters.js",
      "update_businesses.js",
      "@hash/create-agents/create_agents.js",
      "@hash/remove-self/remove_self.js"
    ],
    "agents": {},
    "grid_templates": [
      {
        "template_name": "grid",
        "height": 1,
        "rgb": [
          255,
          255,
          255
        ],
        "behaviors": [
          "customer.js"
        ]
      }
    ],
    "scatter_templates": [
      {
        "template_name": "businesses",
        "template_count": 2,
        "height": 3,
        "item_price": 10,
        "behaviors": [
          "business.js"
        ]
      }
    ]
  }
]
```
{% endcode %}

If you run your simulation now you should see two green agents placed randomly within the grid.

{% hint style="info" %}
Since our agent creator is first defined in `init.json`, which can't run JavaScript, any agent fields that need to be calculated or generated needs to be updated in a separate behavior file \(i.e. update\_behavior.js\).
{% endhint %}

We’re going to update the rgb value of each Business to a random color in `update_businesses.js`.

{% tabs %}
{% tab title="update\_businesses.js" %}
```javascript
const behavior = (state, context) => {
  for (b of state.agents["businesses"]) {
    b.rgb = [Math.random() * 255, Math.random() * 255, Math.random() * 255];
  }
}
```
{% endtab %}
{% endtabs %}

Both agents are now initialized with a random color! Time to move onto building out the `business.js` and `customer.js` behaviors. First let's look at the `business.js` file.

