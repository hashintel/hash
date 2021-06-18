# Physics

The HASH [Physics Library](https://hash.ai/@hash/physics) contains behaviors to help you create simulated physics environments. They are written in Rust, which means they are optimized to run in the HASH Engine.

### Forces

_@hash/physics/forces.rs_

This behavior is responsible for translating forces on an agent into changes in velocity, and changing the agent's position based on the velocity. It makes use of semi-implicit Euler integration to determine changes in position and velocity. The behavior references `state.force` to determine changes in velocity, and clears it after each step, so it should be placed towards the end of an agent's behavior chain.

Agents using this behavior must have a `mass`, `position`, and `velocity`field. The agent or **globals.json** must have a `dt` field which determines the time step for the integration. If your physics simulation does not appear to be behaving properly, you likely need to reduce the value for `dt`. It is recommend to use values between 0.1 and 0.01.

### Gravity

_@hash/physics/gravity.rs_

This behavior adds a force to the agent's `force` field in the negative z direction, representing the force of gravity. If the agent or **globals.json** does not specify a `gravity` field, then it will assume a default value of 9.81 \(the force of gravity in meters/sec\).

### Spring

_@hash/physics/spring.rs_

This behavior simulates a spring connected between the agent and one of its neighbors. It adds a force to the agent's `force` field proportional to it's distance from a certain neighbor, based on the base length of the spring, the spring constant, and the amount of damping. To run this behavior, the agent must have a `springs` field, which contains an array of objects defined likeso:

```javascript
{
  ...
  "behaviors": ["@hash/physics/spring.rs", "@hash/physics/
  "springs": [
    {
      "agent_id": string,
      "length": number,
      "k": number, // The spring 
      "damping": number, // The damping constant B
    }
    ...
  ]
}
```

The spring force is calculated according to Hooke's Law: _F  = -kx - Bv._

{% hint style="warning" %}
If the agent referenced in a spring definition is outside of the `search_radius`, then it will be ignored since it cannot find the position of that agent.
{% endhint %}

### Collision

_@hash/physics/collision.rs_

This behavior controls collisions between agents who come too close to one another. It calculates a purely elastic collision between the agents. Agents running this behavior must have a `mass`, `position`, and `velocity` field specified. If an agent collides with an agent which is **not** running the collision behavior, it will assume the other is immovable \(has an infinite mass\).

{% hint style="warning" %}
Agents must have a `search_radius` of 1 or greater specified to ensure they see other agents.
{% endhint %}

