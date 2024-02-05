---
title: "Modeling with Networks"
date: "2021-04-27"
cover: https://imagedelivery.net/EipKtqu98OotgfhvKf6Eew/5a5a2e18-ff85-460f-32bd-74c6f4a71b00/public
categories: 
  - "Simulation"
---

Networks are a fundamental pattern within simulation modeling. Many important systems can be represented as networks:

- Transportation systems such as bus and subway lines

- Digital systems such as servers and distributed computing systems

- Social systems such as social networks and organizational charts 

The [Networks Library](https://hash.ai/@hash/networks) allows you to easily model networks. Similar to HASH’s existing neighbor system, it allows agents to view their network neighbors' properties. Network neighbors are specified with a list of agent ids, and by running the basic network behavior **`@hash/networks/get_neighbors.js`**, agents will be able to see the properties of their network neighbors, populated in their `network_neighbors` field.

We already mentioned the many domains that can be modeled with networks. Here are some concrete demonstrations of the Networks Library in HASH.

## Opinion Spread

Networks behave differently based on their shape: the number of nodes, number of edges, and where those edges are located all determine network behaviors. We can use the Networks Library to explore the behavior of different types of networks, using a simple model of "opinion spread". We'll assume that agents are either for or against an idea based on their color (green or blue). Agents will match their opinion to whatever the majority of their neighbors believe (including their current opinion in that count). Their initial opinions will be randomly distributed.

There are many different questions you can ask using even a simple model like this, but for now, we'll try and see if certain network structures allow both opinions to coexist, or ultimately lead to a "groupthink" scenario where one opinion is inevitably adopted by all agents. Consider what both scenarios might reflect in a company that is attempting to generate new product ideas, or in a legislature attempting to improve policy.

We'll use the built-in `**@hash/networks/create_nx_graph.py**` to stochastically generate three different types of networks. This behavior makes use of the powerful [NetworkX](https://networkx.org/documentation/stable/index.html) Python package.

You can [experiment with the simulation](https://core.hash.ai/@hash/network-opinion-spread/stable) as you read along.

### In a Random (Erdos-Renyi) Network

In this type of network, a percentage _p_ of all possible edges are assigned randomly between nodes. A random network might look something like this:

![](images/image2.png)

We can observe the change of "opinion" through the network by running the simulation and plotting the prevalence of colors:

![](images/image3.png)

This type of network almost always converges with _p_ \> 0.1 because no individual "clusters" are created. This prevents the preservation of heterogeneity.

### In a Small-World (Watts-Strogatz) Network

Small-world networks are created by modifying a regular lattice network. Edges are rewired between agents with some probability _p_. When the proper values for _p_ are used (typically between 0.01 and 0.1), this type of network is characterized by having high clustering, and low average path length. They might look like this:

![](images/image4.png)

We can see that those characteristics allow it to stop homogeneous convergences of opinion:

![](images/image1.png)

However, if too many edges are rewired (_p_ above 0.2), it begins to look and act like a random network and converges instead of maintaining separation.

### In a Scale-Free (Barabasi-Albert) Network

In a scale-free network, nodes are added sequentially, and attached to other nodes with a probability based on the existing number of edges on that node. This method is known as "preferential attachment". Scale-free networks visually appear closer to random networks, yet maintain far more separate clusters.

![](images/image6.png)

Each new node is attached to "m" other nodes initially. If we run an experiment sweeping over the value of "m", we can see that low values of m prevent complete homogeneity of opinion.

![](images/image5.png)

You can run your own experiments and continue to [explore the model here](https://hash.ai/@hash/network-opinion-spread). What happens if you modify the way that that agents change their opinions in **`opinion_spread.js`**?

* * *

Performing a classic network simulation exploration like this one becomes very easy with HASH and the Networks Library. Let's take a look at what else you can do!

## Information Links

Networks can also be used to link a “manager” agent to many other agents. For instance, if I have a simulation with one agent that determines the weather for the day, I can link it to all my other agents and allow them to easily access this weather property. 

Agents could use the following definitions:

// Weather manager
{
    "agent\_id": "weather\_agent",
    "behaviors": \["weather.js"\],
    "weather": "cloudy"
}

// Other agents
{
    "behaviors": \["@hash/networks/get\_neighbors.js", "check\_weather.js"\],
    "network\_neighbor\_ids": \["weather\_agent"\]
}

And then be able to access the “weather” like so:

// check\_weather.js
const behavior = (state, context) => {
    const weather\_agent = state.network\_neighbors\[0\];
    
    const weather = weather\_agent.weather;
}

## Physical Linkages   

Network neighbors can also be used to link agents for other creative purposes. For instance, in this multiple pendulum model, the different joints and weights are linked together using a network. The `**spring.js**` behavior then generates the appropriate forces between each agent and every one of its network neighbors.

<iframe style="position: absolute; top: 0; left: 0;" src="https://core.hash.ai/embed.html?project=%40hash%2Fpendulum&amp;ref=stable&amp;tabs=3d%2Canalysis" width="100%" height="100%" frameborder="0" scrolling="auto"></iframe>

_Press the run icon to watch the double pendulum in motion_

What will you create with the Networks Library? Let us know what you've built over on the [forums](https://community.hash.ai/), or in [Discord](https://discord.gg/BPMrGAhjPh)!
