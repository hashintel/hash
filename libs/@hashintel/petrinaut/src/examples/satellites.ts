import type { SDCPN } from "../core/types/sdcpn";

export const satellitesSDCPN: { title: string; sdcpn: SDCPN } = {
  title: "Satellites in Orbit",
  sdcpn: {
    places: [
      {
        id: "3cbc7944-34cb-4eeb-b779-4e392a171fe1",
        name: "Space",
        colorId: "f8e9d7c6-b5a4-3210-fedc-ba9876543210",
        dynamicsEnabled: true,
        differentialEquationId: "1a2b3c4d-5e6f-7890-abcd-1234567890ab",
        visualizerCode: `export default Visualization(({ tokens, parameters }) => {
  const { satellite_radius, earth_radius } = parameters;

  const width = 800;
  const height = 600;

  const centerX = width / 2;
  const centerY = height / 2;

  return (
    <svg
      viewBox={\`0 0 \${width} \${height}\`}
      style={{ borderRadius: "4px", width: "100%" }}
    >
      {/* Background */}
      <rect width={width} height={height} fill="#000014" />

      {/* Earth at center */}
      <circle
        cx={centerX}
        cy={centerY}
        r={earth_radius}
        fill="#2196f3"
        stroke="#1976d2"
        strokeWidth="2"
      />

      {/* Satellites */}
      {tokens.map(({ x, y, direction, velocity }, index) => {
        // Convert satellite coordinates to screen coordinates
        // Assuming satellite coordinates are relative to Earth center
        const screenX = centerX + x;
        const screenY = centerY + y;

        return (
          <g key={index}>
            {/* Satellite */}
            <circle
              cx={screenX}
              cy={screenY}
              r={satellite_radius}
              fill="#ff5722"
              stroke="#d84315"
              strokeWidth="1"
            />

            {/* Velocity vector indicator */}
            {velocity > 0 && (
              <line
                x1={screenX}
                y1={screenY}
                x2={screenX + Math.cos(direction) * Math.log(velocity) * 10}
                y2={screenY + Math.sin(direction) * Math.log(velocity) * 10}
                stroke="#ffc107"
                strokeWidth="2"
                markerEnd="url(#arrowhead)"
              />
            )}
          </g>
        );
      })}

      {/* Arrow marker for velocity vectors */}
      <defs>
        <marker
          id="arrowhead"
          markerWidth="8"
          markerHeight="8"
          refX="7"
          refY="4"
          orient="auto"
          markerUnits="strokeWidth"
        >
          <polygon
            points="0 0, 8 4, 0 8"
            fill="#ffc107"
            stroke="#f57f17"
            strokeWidth="0.5"
          />
        </marker>
      </defs>
    </svg>
  );
});`,
        x: 30,
        y: 83.33333333333333,
        width: 130,
        height: 130,
      },
      {
        id: "ea42ba61-03ea-4940-b2e2-b594d5331a71",
        name: "Debris",
        colorId: "f8e9d7c6-b5a4-3210-fedc-ba9876543210",
        dynamicsEnabled: false,
        differentialEquationId: null,
        x: 510,
        y: 75,
        width: 130,
        height: 130,
      },
    ],
    transitions: [
      {
        id: "d25015d8-7aac-45ff-82b0-afd943f1b7ec",
        name: "Collision",
        inputArcs: [
          {
            placeId: "3cbc7944-34cb-4eeb-b779-4e392a171fe1",
            weight: 2,
          },
        ],
        outputArcs: [
          {
            placeId: "ea42ba61-03ea-4940-b2e2-b594d5331a71",
            weight: 2,
          },
        ],
        lambdaType: "predicate",
        lambdaCode: `// Check if two satellites collide (are within collision threshold)
export default Lambda((tokens, parameters) => {
  const { satellite_radius } = parameters;

  // Get the two satellites
  const [a, b] = tokens.Space;

  // Calculate distance between satellites
  const distance = Math.hypot(b.x - a.x, b.y - a.y);

  // Collision occurs if distance is less than threshold
  return distance < satellite_radius;
})`,
        transitionKernelCode: `// When satellites collide, they become debris (lose velocity)
export default TransitionKernel((tokens) => {
  // Both satellites become stationary debris at their collision point
  return {
    Debris: [
      // Position preserved, direction and velocity zeroed
      {
        x: tokens.Space[0].x,
        y: tokens.Space[0].y,
        velocity: 0,
        direction: 0
      },
      {
        x: tokens.Space[1].x,
        y: tokens.Space[1].y,
        velocity: 0,
        direction: 0
      },
    ]
  };
})`,
        x: 255,
        y: 180,
        width: 160,
        height: 80,
      },
      {
        id: "716fe1e5-9b35-413f-83fe-99b28ba73945",
        name: "Crash",
        inputArcs: [
          {
            placeId: "3cbc7944-34cb-4eeb-b779-4e392a171fe1",
            weight: 1,
          },
        ],
        outputArcs: [
          {
            placeId: "ea42ba61-03ea-4940-b2e2-b594d5331a71",
            weight: 1,
          },
        ],
        lambdaType: "predicate",
        lambdaCode: `// Check if satellite crashes into Earth (within crash threshold of origin)
export default Lambda((tokens, parameters) => {
  const { earth_radius } = parameters;

  // Get satellite position
  const { x, y } = tokens.Space[0];

  // Calculate distance from Earth center (origin)
  const distance = Math.hypot(x, y);

  // Crash occurs if satellite is too close to Earth
  return distance < earth_radius;
})`,
        transitionKernelCode: `// When satellite crashes into Earth, it becomes debris at crash site
export default TransitionKernel((tokens) => {
  return {
    Debris: [
      {
        // Position preserved, direction and velocity zeroed
        x: tokens.Space[0].x,
        y: tokens.Space[0].y,
        direction: 0,
        velocity: 0
      },
    ]
  };
})`,
        x: 255,
        y: 30,
        width: 160,
        height: 80,
      },
    ],
    types: [
      {
        id: "f8e9d7c6-b5a4-3210-fedc-ba9876543210",
        name: "Satellite",
        iconSlug: "9a8b7c6d-5e4f-3a2b-1c0d-9e8f7a6b5c4d",
        displayColor: "#1E90FF",
        elements: [
          {
            id: "2b3c4d5e-6f7a-8b9c-0d1e-2f3a4b5c6d7e",
            name: "x",
            type: "real",
          },
          {
            id: "3c4d5e6f-7a8b-9c0d-1e2f-3a4b5c6d7e8f",
            name: "y",
            type: "real",
          },
          {
            id: "4d5e6f7a-8b9c-0d1e-2f3a-4b5c6d7e8f9a",
            name: "direction",
            type: "real",
          },
          {
            id: "5e6f7a8b-9c0d-1e2f-3a4b-5c6d7e8f9a0b",
            name: "velocity",
            type: "real",
          },
        ],
      },
    ],
    differentialEquations: [
      {
        id: "1a2b3c4d-5e6f-7890-abcd-1234567890ab",
        typeId: "f8e9d7c6-b5a4-3210-fedc-ba9876543210",
        name: "Satellite Orbit Dynamics",
        code: `// Example of ODE for Satellite in orbit (simplified)
export default Dynamics((tokens, parameters) => {
  const mu = parameters.gravitational_constant; // Gravitational parameter

  // Process each token (satellite)
  return tokens.map(({ x, y, direction, velocity }) => {
    const r = Math.hypot(x, y); // Distance to Earth center

    // Gravitational acceleration vector (points toward origin)
    const ax = (-mu * x) / (r * r * r);
    const ay = (-mu * y) / (r * r * r);

    // Return derivatives for this token
    return {
      x: velocity * Math.cos(direction),
      y: velocity * Math.sin(direction),
      direction:
        (-ax * Math.sin(direction) + ay * Math.cos(direction)) / velocity,
      velocity:
        ax * Math.cos(direction) + ay * Math.sin(direction),
    }
  })
})`,
      },
    ],
    parameters: [
      {
        id: "6f7a8b9c-0d1e-2f3a-4b5c-6d7e8f9a0b1c",
        name: "Earth Radius",
        variableName: "earth_radius",
        type: "real",
        defaultValue: "50.0",
      },
      {
        id: "7a8b9c0d-1e2f-3a4b-5c6d-7e8f9a0b1c2d",
        name: "Satellite Radius",
        variableName: "satellite_radius",
        type: "real",
        defaultValue: "4.0",
      },
      {
        id: "8b9c0d1e-2f3a-4b5c-6d7e-8f9a0b1c2d3e",
        name: "Collision Threshold",
        variableName: "collision_threshold",
        type: "real",
        defaultValue: "10.0",
      },
      {
        id: "9c0d1e2f-3a4b-5c6d-7e8f-9a0b1c2d3e4f",
        name: "Crash Threshold",
        variableName: "crash_threshold",
        type: "real",
        defaultValue: "5.0",
      },
      {
        id: "0d1e2f3a-4b5c-6d7e-8f9a-0b1c2d3e4f5a",
        name: "Gravitational Constant",
        variableName: "gravitational_constant",
        type: "real",
        defaultValue: "400000.0",
      },
    ],
  },
};
