---
title: Advanced Scenarios
slug: simulation/creating-simulations/behaviors/behavior-keys/advanced-scenarios
objectId: ea0981ad-6f6c-4c43-9d9f-156e86cc71eb
---

# Advanced Scenarios

## How do I use a field defined in another behavior?

If a behavior uses state fields which already have keys defined in other behaviors in your project, you have two options:

1.  Add a key with the same name. If the name matches another behavior key defined in your simulation, it will automatically populate the correct type.
1.  Click the “This behavior uses fields defined in other behaviors” checkbox in the behavior key panel. This will allow your behavior to access fields defined in any other behavior, but comes at a slight cost in performance.

![](https://cdn-us1.hash.ai/site/docs/screenshot-2021-02-11-at-15.20.15.png)

<Hint style="warning">
You'll also need to check the box if your behavior uses a _**variable**_ to dynamically access state, e.g. `state[field_name]`
</Hint>

## How do I use built-in fields?

You can find a full list of the built-in fields [here](/docs/simulation/creating-simulations/anatomy-of-an-agent/state#reserved-fields). You do not need to define these in your behavior keys.

<Hint style="info">
Field Names at the top level of your keys cannot match built-in fields \(e.g. `agent_id`, `position`\) and cannot start with double-underscore \(e.g. `__age`\), which are reserved for engine specific information. Fields below the top level \(i.e. as a child of a top-level field\) may match those names.
</Hint>

## What if I want to rename a key in multiple files?

Behavior keys will only sync their **types** across different behaviors. Changing the name of a behavior key for one beahvior will not change it for others. You will need to update its name in every behavior which references that behavior key.

When you change the name, the type will automatically update for you.

## What if I delete a behavior key?

Deleting a behavior key will only delete it from the current behavior. The same key on other behaviors will not be affected.
