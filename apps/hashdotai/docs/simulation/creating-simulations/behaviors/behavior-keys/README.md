---
title: Behavior Keys
slug: simulation/creating-simulations/behaviors/behavior-keys
objectId: 87c9a2d6-cf71-4194-ae1c-a7db3e4643b2
---

# Behavior Keys

Behavior Keys define the **data** **type** of the fields that a behavior accesses on an agent's state. HASH uses behavior keys to improve the runtime performance of simulations. To view the behavior keys associated with a file, click the button containing the _brain_ icon, located next to the help button, to toggle the key panel's visibility \(highlighted in green below\).

![Adding behavior keys](https://cdn-us1.hash.ai/site/docs/image%20%2866%29.png)

From the behavior key panel you can define the field the behavior will need to access by putting in the name of the field - the same name as its field name on the agents state object - and the type of the field.

## How do I know what fields I need to assign?

Any custom fields your behavior is getting from state, or setting in state, should have an entry in your behavior keys. For example, if your behavior calls `state.cost = 300`, you should have a behavior key called `cost` with type `number`. You do not need to create entries for special fields which HASH defines - see 'Built-in Fields' below.

<Hint style="info">
If you type in the name of a behavior key that already exists in your simulation, the type will **automatically** be populated based on the existing key's type.
</Hint>

<Embed type="youtube" url="https://youtu.be/oBrDX6JDCN8" caption="" />

<Hint style="warning">
  
Behavior Keys are **optional** for in-browser simulation runs, but are **required** for cloud runs.
  
</Hint>
