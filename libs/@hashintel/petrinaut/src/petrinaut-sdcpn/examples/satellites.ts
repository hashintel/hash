import type { SDCPN } from "../../core/types/sdcpn";

export const satellitesSDCPN: SDCPN = {
  id: "sdcpn-1762206865689",
  title: "Satellites in Orbit",
  places: [
    {
      id: "place__3cbc7944-34cb-4eeb-b779-4e392a171fe1",
      name: "Space",
      type: "type-satellite",
      dynamicsEnabled: true,
      differentialEquationCode: { refId: "de-satellite-orbit" },
      x: 30,
      y: 83.33333333333333,
      width: 130,
      height: 130,
    },
    {
      id: "place__ea42ba61-03ea-4940-b2e2-b594d5331a71",
      name: "Debris",
      type: null,
      dynamicsEnabled: false,
      differentialEquationCode: "",
      x: 510,
      y: 75,
      width: 130,
      height: 130,
    },
  ],
  transitions: [
    {
      id: "transition__d25015d8-7aac-45ff-82b0-afd943f1b7ec",
      name: "Collision",
      inputArcs: [
        {
          placeId: "place__3cbc7944-34cb-4eeb-b779-4e392a171fe1",
          weight: 2,
        },
      ],
      outputArcs: [
        {
          placeId: "place__ea42ba61-03ea-4940-b2e2-b594d5331a71",
          weight: 2,
        },
      ],
      lambdaType: "predicate",
      lambdaCode: `// Check if two satellites collide (are within collision threshold)
export default Lambda(([tokens], parameters) => {
  const collision_threshold = parameters.collision_threshold || 10.0;
  
  // Get positions of the two satellites
  const [x1, y1] = tokens[0];
  const [x2, y2] = tokens[1];
  
  // Calculate distance between satellites
  const distance = Math.hypot(x2 - x1, y2 - y1);
  
  // Collision occurs if distance is less than threshold
  return distance < collision_threshold;
})`,
      transitionKernelCode: `// When satellites collide, they become debris (lose velocity)
export default TransitionKernel((tokens) => {
  // Both satellites become stationary debris at their collision point
  return tokens.map(([x, y]) => {
    return [x, y, 0, 0]; // Position preserved, direction and velocity zeroed
  });
})`,
      x: 255,
      y: 180,
      width: 160,
      height: 80,
    },
    {
      id: "transition__716fe1e5-9b35-413f-83fe-99b28ba73945",
      name: "Crash",
      inputArcs: [
        {
          placeId: "place__3cbc7944-34cb-4eeb-b779-4e392a171fe1",
          weight: 1,
        },
      ],
      outputArcs: [
        {
          placeId: "place__ea42ba61-03ea-4940-b2e2-b594d5331a71",
          weight: 1,
        },
      ],
      lambdaType: "predicate",
      lambdaCode: `// Check if satellite crashes into Earth (within crash threshold of origin)
export default Lambda((tokens, parameters) => {
  if (tokens.length < 1) return false;
  
  const crash_threshold = parameters.crash_threshold || 5.0;
  
  // Get satellite position
  const [x, y] = tokens[0];
  
  // Calculate distance from Earth center (origin)
  const distance = Math.hypot(x, y);
  
  // Crash occurs if satellite is too close to Earth
  return distance < crash_threshold;
})`,
      transitionKernelCode: `// When satellite crashes into Earth, it becomes debris at crash site
export default TransitionKernel((tokens) => {
  return tokens.map(([x, y]) => {
    return [x, y, 0, 0]; // Position preserved, direction and velocity zeroed
  });
})`,
      x: 255,
      y: 30,
      width: 160,
      height: 80,
    },
  ],
  types: [
    {
      id: "type-satellite",
      name: "Satellite",
      iconId: "circle",
      colorCode: "#1E90FF",
      elements: [
        { id: "satellite-x", name: "x", type: "real" },
        { id: "satellite-y", name: "y", type: "real" },
        { id: "satellite-direction", name: "direction", type: "real" },
        { id: "satellite-speed", name: "velocity", type: "real" },
      ],
    },
  ],
  differentialEquations: [
    {
      id: "de-satellite-orbit",
      typeId: "type-satellite",
      name: "Satellite Orbit Dynamics",
      code: `// Example of ODE for Satellite in orbit (simplified)
// Receives: placeValues (Float64Array with all token values concatenated: [x1,y1,dir1,vel1, x2,y2,dir2,vel2, ...])
// Returns: Float64Array with derivatives in same structure: [dx1,dy1,ddir1,dvel1, dx2,dy2,ddir2,dvel2, ...]
export default Dynamics((placeValues, t, parameters) => {
  const mu = parameters.gravitational_constant || 400000.0; // Gravitational parameter
  
  const dimensions = 4; // x, y, direction, velocity
  const numTokens = placeValues.length / dimensions;
  const derivatives = new Float64Array(placeValues.length);
  
  // Process each token (satellite)
  for (let i = 0; i < numTokens; i++) {
    const offset = i * dimensions;
    const x = placeValues[offset];
    const y = placeValues[offset + 1];
    const direction = placeValues[offset + 2];
    const velocity = placeValues[offset + 3];
    
    const r = Math.hypot(x, y); // Distance to Earth center
    
    // Gravitational acceleration vector (points toward origin)
    const ax = (-mu * x) / (r * r * r);
    const ay = (-mu * y) / (r * r * r);
    
    // Project that acceleration into satellite's velocity frame
    const ddirection =
      (-ax * Math.sin(direction) + ay * Math.cos(direction)) / velocity;
    const dvelocity = ax * Math.cos(direction) + ay * Math.sin(direction);
    
    // Position derivative (from velocity)
    const dx = velocity * Math.cos(direction);
    const dy = velocity * Math.sin(direction);
    
    // Store derivatives for this token
    derivatives[offset] = dx;
    derivatives[offset + 1] = dy;
    derivatives[offset + 2] = ddirection;
    derivatives[offset + 3] = dvelocity;
  }
  
  return derivatives;
})`,
    },
  ],
  parameters: [
    {
      id: "param-collision-threshold",
      name: "Collision Threshold",
      variableName: "collision_threshold",
      type: "real",
      defaultValue: "10.0",
    },
    {
      id: "param-crash-threshold",
      name: "Crash Threshold",
      variableName: "crash_threshold",
      type: "real",
      defaultValue: "5.0",
    },
    {
      id: "param-gravitational-constant",
      name: "Gravitational Constant",
      variableName: "gravitational_constant",
      type: "real",
      defaultValue: "400000.0",
    },
  ],
};
