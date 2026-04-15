import { SNAP_GRID_SIZE } from "../constants/ui";
import type { SDCPN } from "../core/types/sdcpn";

export const probabilisticSatellitesSDCPN: {
  title: string;
  petriNetDefinition: SDCPN;
} = {
  title: "Probabilistic Satellites Launcher",
  petriNetDefinition: {
    places: [
      {
        id: "3cbc7944-34cb-4eeb-b779-4e392a171fe1",
        name: "Space",
        colorId: "f8e9d7c6-b5a4-3210-fedc-ba9876543210",
        dynamicsEnabled: true,
        differentialEquationId: "1a2b3c4d-5e6f-7890-abcd-1234567890ab",
        visualizerCode: `export default Visualization(({ tokens, parameters }) => {
  const { satellite_radius, planet_radius } = parameters;

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

      {/* Planet at center */}
      <circle
        cx={centerX}
        cy={centerY}
        r={planet_radius}
        fill="#2196f3"
        stroke="#1976d2"
        strokeWidth="2"
      />

      {/* Satellites */}
      {tokens.map(({ x, y, direction, velocity }, index) => {
        // Convert satellite coordinates to screen coordinates
        // Assuming satellite coordinates are relative to planet center
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
        x: 1 * SNAP_GRID_SIZE,
        y: 6 * SNAP_GRID_SIZE,
      },
      {
        id: "ea42ba61-03ea-4940-b2e2-b594d5331a71",
        name: "Debris",
        colorId: "f8e9d7c6-b5a4-3210-fedc-ba9876543210",
        dynamicsEnabled: false,
        differentialEquationId: null,
        x: 36 * SNAP_GRID_SIZE,
        y: 6 * SNAP_GRID_SIZE,
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
            type: "standard",
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
        x: 18 * SNAP_GRID_SIZE,
        y: 12 * SNAP_GRID_SIZE,
      },
      {
        id: "716fe1e5-9b35-413f-83fe-99b28ba73945",
        name: "Crash",
        inputArcs: [
          {
            placeId: "3cbc7944-34cb-4eeb-b779-4e392a171fe1",
            weight: 1,
            type: "standard",
          },
        ],
        outputArcs: [
          {
            placeId: "ea42ba61-03ea-4940-b2e2-b594d5331a71",
            weight: 1,
          },
        ],
        lambdaType: "predicate",
        lambdaCode: `// Check if satellite crashes into planet (within crash threshold of origin)
export default Lambda((tokens, parameters) => {
  const { planet_radius, crash_threshold, satellite_radius } = parameters;

  // Get satellite position
  const { x, y } = tokens.Space[0];

  // Calculate distance from planet center (origin)
  const distance = Math.hypot(x, y);

  // Crash occurs if satellite is too close to planet
  return distance < planet_radius + crash_threshold + satellite_radius;
})`,
        transitionKernelCode: `// When satellite crashes into planet, it becomes debris at crash site
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
        x: 18 * SNAP_GRID_SIZE,
        y: 1 * SNAP_GRID_SIZE,
      },
      {
        id: "transition__c7008acb-b0e7-468e-a5d3-d56eaa1fe806",
        name: "LaunchSatellite",
        inputArcs: [],
        outputArcs: [
          {
            placeId: "3cbc7944-34cb-4eeb-b779-4e392a171fe1",
            weight: 1,
          },
        ],
        lambdaType: "stochastic",
        lambdaCode: `export default Lambda((tokensByPlace, parameters) => {
  return parameters.launch_rate;
});`,
        transitionKernelCode: `export default TransitionKernel((tokensByPlace, parameters) => {
  const { planet_radius, altitude, initial_velocity } = parameters;

  const distance = planet_radius + altitude;
  const angle = Distribution.Uniform(0, Math.PI * 2);

  return {
    Space: [
      {
        x: angle.map(a => Math.cos(a) * distance),
        y: angle.map(a => Math.sin(a) * distance),
        direction: Distribution.Uniform(0, Math.PI * 2),
        velocity: Distribution.Gaussian(initial_velocity, initial_velocity * 0.1)
      }
    ],
  };
});`,
        x: -17 * SNAP_GRID_SIZE,
        y: 2 * SNAP_GRID_SIZE,
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
            elementId: "2b3c4d5e-6f7a-8b9c-0d1e-2f3a4b5c6d7e",
            name: "x",
            type: "real",
          },
          {
            elementId: "3c4d5e6f-7a8b-9c0d-1e2f-3a4b5c6d7e8f",
            name: "y",
            type: "real",
          },
          {
            elementId: "4d5e6f7a-8b9c-0d1e-2f3a-4b5c6d7e8f9a",
            name: "direction",
            type: "real",
          },
          {
            elementId: "5e6f7a8b-9c0d-1e2f-3a4b-5c6d7e8f9a0b",
            name: "velocity",
            type: "real",
          },
        ],
      },
    ],
    differentialEquations: [
      {
        id: "1a2b3c4d-5e6f-7890-abcd-1234567890ab",
        colorId: "f8e9d7c6-b5a4-3210-fedc-ba9876543210",
        name: "Satellite Orbit Dynamics",
        code: `// Example of ODE for Satellite in orbit (simplified)
export default Dynamics((tokens, parameters) => {
  const mu = parameters.gravitational_constant; // Gravitational parameter

  // Process each token (satellite)
  return tokens.map(({ x, y, direction, velocity }) => {
    const r = Math.hypot(x, y); // Distance to planet center

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
        name: "Planet Radius",
        variableName: "planet_radius",
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
      {
        id: "1e2f3a4b-5c6d-7e8f-9a0b-1c2d3e4f5a6b",
        name: "Altitude",
        variableName: "altitude",
        type: "real",
        defaultValue: "40.0",
      },
      {
        id: "2f3a4b5c-6d7e-8f9a-0b1c-2d3e4f5a6b7c",
        name: "Launch Rate",
        variableName: "launch_rate",
        type: "real",
        defaultValue: "0.5",
      },
      {
        id: "3a4b5c6d-7e8f-9a0b-1c2d-3e4f5a6b7c8d",
        name: "Initial Velocity",
        variableName: "initial_velocity",
        type: "real",
        defaultValue: "67.0",
      },
    ],
    scenarios: [
      {
        id: "scenario__moon_orbit",
        name: "Moon Orbit",
        description:
          "Low gravity, small body. Satellites drift in gentle arcs around a lunar-mass body.",
        scenarioParameters: [
          { type: "real", identifier: "launch_rate", default: 0.3 },
          {
            type: "real",
            identifier: "satellite_initial_altitude",
            default: 20,
          },
          {
            type: "real",
            identifier: "satellite_initial_velocity",
            default: 11,
          },
        ],
        parameterOverrides: {
          // Planet-specific (hardcoded): gravitational_constant, planet_radius
          "0d1e2f3a-4b5c-6d7e-8f9a-0b1c2d3e4f5a": "5000",
          "6f7a8b9c-0d1e-2f3a-4b5c-6d7e8f9a0b1c": "14",
          // Forwarded from scenario parameters
          "2f3a4b5c-6d7e-8f9a-0b1c-2d3e4f5a6b7c": "scenario.launch_rate",
          "1e2f3a4b-5c6d-7e8f-9a0b-1c2d3e4f5a6b":
            "scenario.satellite_initial_altitude",
          "3a4b5c6d-7e8f-9a0b-1c2d-3e4f5a6b7c8d":
            "scenario.satellite_initial_velocity",
        },
        initialState: { type: "per_place", content: {} },
      },
      {
        id: "scenario__earth_orbit",
        name: "Earth Orbit",
        description:
          "Standard Earth gravity. High orbital velocities with frequent launches into low orbit.",
        scenarioParameters: [
          { type: "real", identifier: "launch_rate", default: 0.5 },
          {
            type: "real",
            identifier: "satellite_initial_altitude",
            default: 40,
          },
          {
            type: "real",
            identifier: "satellite_initial_velocity",
            default: 67,
          },
        ],
        parameterOverrides: {
          "0d1e2f3a-4b5c-6d7e-8f9a-0b1c2d3e4f5a": "400000",
          "6f7a8b9c-0d1e-2f3a-4b5c-6d7e8f9a0b1c": "50",
          "2f3a4b5c-6d7e-8f9a-0b1c-2d3e4f5a6b7c": "scenario.launch_rate",
          "1e2f3a4b-5c6d-7e8f-9a0b-1c2d3e4f5a6b":
            "scenario.satellite_initial_altitude",
          "3a4b5c6d-7e8f-9a0b-1c2d-3e4f5a6b7c8d":
            "scenario.satellite_initial_velocity",
        },
        initialState: { type: "per_place", content: {} },
      },
      {
        id: "scenario__mars_orbit",
        name: "Mars Orbit",
        description:
          "Intermediate gravity between Moon and Earth. Moderate orbital speeds with a thin atmosphere margin.",
        scenarioParameters: [
          { type: "real", identifier: "launch_rate", default: 0.4 },
          {
            type: "real",
            identifier: "satellite_initial_altitude",
            default: 25,
          },
          {
            type: "real",
            identifier: "satellite_initial_velocity",
            default: 29,
          },
        ],
        parameterOverrides: {
          "0d1e2f3a-4b5c-6d7e-8f9a-0b1c2d3e4f5a": "43000",
          "6f7a8b9c-0d1e-2f3a-4b5c-6d7e8f9a0b1c": "27",
          "2f3a4b5c-6d7e-8f9a-0b1c-2d3e4f5a6b7c": "scenario.launch_rate",
          "1e2f3a4b-5c6d-7e8f-9a0b-1c2d3e4f5a6b":
            "scenario.satellite_initial_altitude",
          "3a4b5c6d-7e8f-9a0b-1c2d-3e4f5a6b7c8d":
            "scenario.satellite_initial_velocity",
        },
        initialState: { type: "per_place", content: {} },
      },
      {
        id: "scenario__solar_orbit",
        name: "Solar Orbit",
        description:
          "Massive central body with extreme gravity. Satellites need very high velocities to maintain distant orbits.",
        scenarioParameters: [
          { type: "real", identifier: "launch_rate", default: 0.6 },
          {
            type: "real",
            identifier: "satellite_initial_altitude",
            default: 50,
          },
          {
            type: "real",
            identifier: "satellite_initial_velocity",
            default: 196,
          },
        ],
        parameterOverrides: {
          "0d1e2f3a-4b5c-6d7e-8f9a-0b1c2d3e4f5a": "5000000",
          "6f7a8b9c-0d1e-2f3a-4b5c-6d7e8f9a0b1c": "80",
          "2f3a4b5c-6d7e-8f9a-0b1c-2d3e4f5a6b7c": "scenario.launch_rate",
          "1e2f3a4b-5c6d-7e8f-9a0b-1c2d3e4f5a6b":
            "scenario.satellite_initial_altitude",
          "3a4b5c6d-7e8f-9a0b-1c2d-3e4f5a6b7c8d":
            "scenario.satellite_initial_velocity",
        },
        initialState: { type: "per_place", content: {} },
      },
    ],
  },
};
