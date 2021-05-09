# Planning the Build

Let’s apply this mental model to the [Oil Supply Chain](https://hash.ai/@hash/oil-supply-chain) model.

We start by cataloguing the agents. In AnyLogic you can double click on any of the agents to see the relevant functions, properties, state charts, etc.

### Agents

**FuelTruck**

{% tabs %}
{% tab title="Purpose" %}
Fuel Trucks transport oil from refineries and storage agents to retailer agents.
{% endtab %}

{% tab title="Properties" %}
* retailer: The location of a RetailerAgent to deliver to
* capacity: The amount of oil a fuel truck can store
* loadingRate: How long it takes to load oil from a storage unit into the truck
{% endtab %}

{% tab title="Behaviors" %}
* A fuel truck should respond to demand from retailers by picking up oil.
* A fuel truck should load oil at a loadingRate from a refinery/storage location
* A fuel truck should deposit it at a given retailer
{% endtab %}
{% endtabs %}

**Refinery**

{% tabs %}
{% tab title="Purpose" %}
Refinery Agents take unprocessed oil and refine it into oil that can be delivered to storage units / retailers
{% endtab %}

{% tab title="Properties" %}
* capacity: amount of oil a refinery agent can store
* refiningRate: speed that unrefined oil is refined
{% endtab %}

{% tab title="Behaviors" %}
* A refinery agent should accept and store crude oil
* A refinery agent should 'process' the crude oil, turning it into refined oil
* A refinery agent should load oil into fuel trucks or storage units
{% endtab %}
{% endtabs %}

**Retailer**

{% tabs %}
{% tab title="Purpose" %}
Retailers represent customer demand for oil and request and receive oil from fuel agents.
{% endtab %}

{% tab title="Properties" %}
* capacity: amount of oil a retailer can store
* reorderLevel: the level of current capacity vs. max at which retailer orders fuel
* meanOrder: mean order size of fuel
{% endtab %}

{% tab title="Behaviors" %}
* Retailers should place orders w/ fuel trucks to be resupplied
* Retailers should accept oil from fuel trucks
* Retailers should decrease their current stock over time.
{% endtab %}
{% endtabs %}

**Storage**

{% tabs %}
{% tab title="Purpose" %}
Storage agents hold unrefined and refined oil.
{% endtab %}

{% tab title="Properties" %}
* capacity:  amount of oil a storage agent can store
* terminal: boolean value for whether a storage agent is a terminal destination \(at which point the oil leaves the simulation\)
* type: type of storage agent \(ports, storage, distributors\)
{% endtab %}

{% tab title="Behaviors" %}
* A storage agent should respond to refinery agents, tankers, fuel truck agents and send oil or accept oil
* A storage agent should send x amount of oil to an agent, where x is the loadingRate/unloadingRate of the agent
{% endtab %}
{% endtabs %}

In the AnyLogic model there are three different types of storage locations: ports, storages, and distributors

* Ports have to be able to unload oil from Tanker agents
* Storages need to be able to accept the flow of oil in and out
* Distributors need to be able to send trucks to refuel retailers

All of these share lots of features, so we’ll be able to make use of HASH’s composable behaviors to define our agents.

**Tanker**

{% tabs %}
{% tab title="Purpose" %}
Tankers deliver oil from ‘outside the sim’ \(they actually generate it\) to storage units
{% endtab %}

{% tab title="Properties" %}
* capacity:  amount of oil a tanker agent can store
* unloadRate: the speed tankers can deliver oil
{% endtab %}

{% tab title="Behaviors" %}
* Tankers should move to storage agents to deliver oil
* Tankers should unload oil into storage agents
* Tankers should fill their oil to capacity if at a specific position
{% endtab %}
{% endtabs %}

If you’ve been following along you’ll notice we left off one agent - Pipelines. Pipelines act as a flow regulator, decreasing quantity in one agent and delivering it to another. In our simulation we're going to use [messages](../../../creating-simulations/agent-messages/) to accomplish a similar thing. Messaging is a key primitive operation provided by HASH, and as you’ll see we use it throughout the simulation. 

Since we can represent the behavior of Pipelines completely through messages, we'll effectively combine it with the Storage agents to reduce the number of agents in the simulation, and the complexity of interactions. But more on that later.

