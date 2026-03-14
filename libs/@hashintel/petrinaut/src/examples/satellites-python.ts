import type { SDCPN } from "../core/types/sdcpn";

export const satellitesPythonSDCPN: {
  title: string;
  petriNetDefinition: SDCPN;
} = {
  title: "Satellites in Orbit (Python)",
  petriNetDefinition: {
    language: "python",
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
        const screenX = centerX + x;
        const screenY = centerY + y;

        return (
          <g key={index}>
            <circle
              cx={screenX}
              cy={screenY}
              r={satellite_radius}
              fill="#ff5722"
              stroke="#d84315"
              strokeWidth="1"
            />

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
      },
      {
        id: "ea42ba61-03ea-4940-b2e2-b594d5331a71",
        name: "Debris",
        colorId: "f8e9d7c6-b5a4-3210-fedc-ba9876543210",
        dynamicsEnabled: false,
        differentialEquationId: null,
        x: 510,
        y: 75,
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
        lambdaCode: `# Check if two satellites collide (are within collision threshold)
def lambda_fn(tokens, parameters):
    satellite_radius = parameters["satellite_radius"]

    # Get the two satellites
    a = tokens["Space"][0]
    b = tokens["Space"][1]

    # Calculate distance between satellites
    distance = math.hypot(b["x"] - a["x"], b["y"] - a["y"])

    # Collision occurs if distance is less than threshold
    return distance < satellite_radius`,
        transitionKernelCode: `# When satellites collide, they become debris (lose velocity)
def transition_kernel(tokens, parameters):
    # Both satellites become stationary debris at their collision point
    return {
        "Debris": [
            # Position preserved, direction and velocity zeroed
            {
                "x": tokens["Space"][0]["x"],
                "y": tokens["Space"][0]["y"],
                "velocity": 0,
                "direction": 0,
            },
            {
                "x": tokens["Space"][1]["x"],
                "y": tokens["Space"][1]["y"],
                "velocity": 0,
                "direction": 0,
            },
        ]
    }`,
        x: 255,
        y: 180,
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
        lambdaCode: `# Check if satellite crashes into Earth (within crash threshold of origin)
def lambda_fn(tokens, parameters):
    earth_radius = parameters["earth_radius"]
    crash_threshold = parameters["crash_threshold"]
    satellite_radius = parameters["satellite_radius"]

    # Get satellite position
    x = tokens["Space"][0]["x"]
    y = tokens["Space"][0]["y"]

    # Calculate distance from Earth center (origin)
    distance = math.hypot(x, y)

    # Crash occurs if satellite is too close to Earth
    return distance < earth_radius + crash_threshold + satellite_radius`,
        transitionKernelCode: `# When satellite crashes into Earth, it becomes debris at crash site
def transition_kernel(tokens, parameters):
    return {
        "Debris": [
            {
                # Position preserved, direction and velocity zeroed
                "x": tokens["Space"][0]["x"],
                "y": tokens["Space"][0]["y"],
                "direction": 0,
                "velocity": 0,
            },
        ]
    }`,
        x: 255,
        y: 30,
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
        code: `# ODE for satellite in orbit (simplified)
def dynamics(tokens, parameters):
    mu = parameters["gravitational_constant"]  # Gravitational parameter

    # Process each token (satellite)
    result = []
    for token in tokens:
        x = token["x"]
        y = token["y"]
        direction = token["direction"]
        velocity = token["velocity"]

        r = math.hypot(x, y)  # Distance to Earth center

        # Gravitational acceleration vector (points toward origin)
        ax = (-mu * x) / (r * r * r)
        ay = (-mu * y) / (r * r * r)

        # Derivatives for this token
        result.append({
            "x": velocity * math.cos(direction),
            "y": velocity * math.sin(direction),
            "direction": (-ax * math.sin(direction) + ay * math.cos(direction)) / velocity,
            "velocity": ax * math.cos(direction) + ay * math.sin(direction),
        })
    return result`,
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
