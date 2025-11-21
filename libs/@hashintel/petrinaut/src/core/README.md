# SDCPN prototype

This library contains core functionalities for simulating Stochastic Deterministic Colored Petri Nets (SDCPNs). It provides data structures and algorithms to define, manipulate, and execute SDCPN models.

```ts
import { createSDCPN, createSimulation } from "@hashintel/petrinaut";

const sdcpn = createSDCPN({
  id: "example-sdcpn",
  name: "Example SDCPN Model",
  places: [
    {
      id: "p-space",
      name: "Space",
      dimensions: [
        { name: "x", type: "real" },
        { name: "y", type: "real" },
        { name: "direction", type: "real" },
        { name: "velocity", type: "real" },
      ],
      differentialEquation: `export default Dynamics((tokens) => {
        const mu = 400000.0; // Gravitational parameter

        // Return derivatives for each dimension of each token
        return tokens.map(([x, y, angle, velocity]) => {
          const r = Math.hypot(x, y); // Distance to Earth center
    
          // Gravitational acceleration vector (points toward origin)
          const ax = (-mu * x) / (r * r * r);
          const ay = (-mu * y) / (r * r * r);
          
          // Project that acceleration into satellite’s velocity frame
          const ddirection =
            (-ax * Math.sin(direction) + ay * Math.cos(direction)) / velocity;
          const dvelocity = ax * Math.cos(direction) + ay * Math.sin(direction);
          
          // Position derivative (from velocity)
          const dx = velocity * Math.cos(direction);
          const dy = velocity * Math.sin(direction);

          return [dx, dy, ddirection, dvelocity];
        });
      })`,
    },
    {
      id: "p-cemetery",
      name: "Cemetery",
      dimensions: [],
      // No dynamics needed for cemetery
      // nor dimensions
    },
  ],
  transitions: [
    {
      id: "t-collision",
      name: "Collision",
      inputArcs: [{ placeId: "p-space", weight: 2 }],
      outputArcs: [{ placeId: "p2", weight: 2 }],
      lambdaCode: `export default Lambda(([s1, s2]) => {
        const distance = Math.hypot(s1[0] - s2[0], s1[1] - s2[1]);
        const collisionDistance = 10.0; // Threshold for collision
        return distance < collisionDistance ? Infinity : 0.0;
      })`,
      transitionKernelCode: `
        export default TransitionKernel(([place1]) =>
          // Generate token in cemetery, without any dimensions
          return [[[]]];
        })`,
    },
    {
      id: "t-crash",
      name: "Crash",
      inputArcs: [{ placeId: "p-space", weight: 1 }],
      outputArcs: [{ placeId: "p-debris", weight: 1 }],
      lambdaCode: `export default Lambda(( [s] ) => {
        const crashProbabilityPerSecond = 0.0001;
        return crashProbabilityPerSecond;
      })`,
      transitionKernelCode: `
        export default TransitionKernel(([spaceToken]) => {
          // Generate token in cemetery, without any dimensions
          return [[[]]];
        })`,
    },
  ],
});

// Simulation is stateful instance of SDCPN execution
const simulation = createSimulation(sdcpn, {
  dt: 0.1, // Time step for numerical integration
  rngSeed: 42, // Seed for random number generation
  initialMarking: {
    "p-space": [
      [7000.0, 0.0, Math.PI / 2, 7.5], // Token 1
      [7000.0, 10.0, Math.PI / 2, 7.5], // Token 2
    ],
  },
});

// Generate simulation frames
const firstFrame = simulation.getCurrentFrame();
const nextFrame = simulation.step();

await simulation.play({ maxFrames: 400 }); // Start continuous simulation

simulation.numberOfFrames(); // Get total number of frames generated
simulation.getFrame(100); // Retrieve specific frame by index
```
