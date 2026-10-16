# Example net

Here is a compact example Petrinaut document demonstrating coloured tokens, stochastic and predicate transitions, transition kernels with distributions, continuous dynamics, parameters, visualizer code, and scenarios:

```json
{
  "title": "Probabilistic Satellite Launcher",
  "petriNetDefinition": {
    "description": "Orbital mechanics simulation: satellites launch stochastically into orbit around a central body, a gravitational ODE integrates their position and velocity, and collisions between satellites or crashes into the planet turn them into debris.",
    "places": [
      {
        "id": "3cbc7944-34cb-4eeb-b779-4e392a171fe1",
        "name": "Space",
        "showAsInitialState": true,
        "description": "Satellites in orbit. The orbit dynamics integrate each one's position and velocity under the planet's gravity, and a custom visualizer draws them around the planet.",
        "colorId": "f8e9d7c6-b5a4-3210-fedc-ba9876543210",
        "dynamicsEnabled": true,
        "differentialEquationId": "1a2b3c4d-5e6f-7890-abcd-1234567890ab",
        "visualizerCode": "export default Visualization(({ tokens, parameters }) => {\n  const { satellite_radius, planet_radius } = parameters;\n\n  const width = 800;\n  const height = 600;\n\n  const centerX = width / 2;\n  const centerY = height / 2;\n\n  return (\n    <svg\n      viewBox={`0 0 ${width} ${height}`}\n      style={{ borderRadius: \"4px\", width: \"100%\" }}\n    >\n      {/* Background */}\n      <rect width={width} height={height} fill=\"#000014\" />\n\n      {/* Planet at center */}\n      <circle\n        cx={centerX}\n        cy={centerY}\n        r={planet_radius}\n        fill=\"#2196f3\"\n        stroke=\"#1976d2\"\n        strokeWidth=\"2\"\n      />\n\n      {/* Satellites */}\n      {tokens.map(({ x, y, direction, velocity }, index) => {\n        // Convert satellite coordinates to screen coordinates\n        // Assuming satellite coordinates are relative to planet center\n        const screenX = centerX + x;\n        const screenY = centerY + y;\n\n        return (\n          <g key={index}>\n            {/* Satellite */}\n            <circle\n              cx={screenX}\n              cy={screenY}\n              r={satellite_radius}\n              fill=\"#ff5722\"\n              stroke=\"#d84315\"\n              strokeWidth=\"1\"\n            />\n\n            {/* Velocity vector indicator */}\n            {velocity > 0 && (\n              <line\n                x1={screenX}\n                y1={screenY}\n                x2={screenX + Math.cos(direction) * Math.log(velocity) * 10}\n                y2={screenY + Math.sin(direction) * Math.log(velocity) * 10}\n                stroke=\"#ffc107\"\n                strokeWidth=\"2\"\n                markerEnd=\"url(#arrowhead)\"\n              />\n            )}\n          </g>\n        );\n      })}\n\n      {/* Arrow marker for velocity vectors */}\n      <defs>\n        <marker\n          id=\"arrowhead\"\n          markerWidth=\"8\"\n          markerHeight=\"8\"\n          refX=\"7\"\n          refY=\"4\"\n          orient=\"auto\"\n          markerUnits=\"strokeWidth\"\n        >\n          <polygon\n            points=\"0 0, 8 4, 0 8\"\n            fill=\"#ffc107\"\n            stroke=\"#f57f17\"\n            strokeWidth=\"0.5\"\n          />\n        </marker>\n      </defs>\n    </svg>\n  );\n});",
        "x": 15,
        "y": 90
      },
      {
        "id": "ea42ba61-03ea-4940-b2e2-b594d5331a71",
        "name": "Debris",
        "description": "Defunct objects left by collisions and crashes, frozen at the point of impact with zero velocity.",
        "colorId": "f8e9d7c6-b5a4-3210-fedc-ba9876543210",
        "dynamicsEnabled": false,
        "differentialEquationId": null,
        "x": 540,
        "y": 90
      }
    ],
    "transitions": [
      {
        "id": "d25015d8-7aac-45ff-82b0-afd943f1b7ec",
        "name": "Collision",
        "description": "Two satellites whose surfaces come within the collision threshold collide and become two pieces of stationary debris at the impact point.",
        "inputArcs": [
          {
            "placeId": "3cbc7944-34cb-4eeb-b779-4e392a171fe1",
            "weight": 2,
            "type": "standard"
          }
        ],
        "outputArcs": [
          {
            "placeId": "ea42ba61-03ea-4940-b2e2-b594d5331a71",
            "weight": 2
          }
        ],
        "lambdaType": "predicate",
        "lambdaCode": "// Check if two satellites collide (are within collision threshold)\nconst { collision_threshold, satellite_radius } = parameters;\n\n// Get the two satellites\nconst [a, b] = input.Space;\n\n// Calculate distance between satellites\nconst distance = Math.hypot(b.x - a.x, b.y - a.y);\n\n// Collision occurs when the satellite surfaces are within the threshold\nreturn distance < satellite_radius * 2 + collision_threshold;",
        "transitionKernelCode": "// When satellites collide, they become debris (lose velocity)\n// Both satellites become stationary debris at their collision point\nreturn {\n  Debris: [\n    // Position preserved, direction and velocity zeroed\n    {\n      x: input.Space[0].x,\n      y: input.Space[0].y,\n      velocity: 0,\n      direction: 0\n    },\n    {\n      x: input.Space[1].x,\n      y: input.Space[1].y,\n      velocity: 0,\n      direction: 0\n    },\n  ]\n};",
        "x": 270,
        "y": 180
      },
      {
        "id": "716fe1e5-9b35-413f-83fe-99b28ba73945",
        "name": "Crash",
        "description": "A satellite that falls within the crash threshold of the planet surface crashes and becomes debris at the crash site.",
        "inputArcs": [
          {
            "placeId": "3cbc7944-34cb-4eeb-b779-4e392a171fe1",
            "weight": 1,
            "type": "standard"
          }
        ],
        "outputArcs": [
          {
            "placeId": "ea42ba61-03ea-4940-b2e2-b594d5331a71",
            "weight": 1
          }
        ],
        "lambdaType": "predicate",
        "lambdaCode": "// Check if satellite crashes into planet (within crash threshold of origin)\nconst { planet_radius, crash_threshold, satellite_radius } = parameters;\n\n// Get satellite position\nconst { x, y } = input.Space[0];\n\n// Calculate distance from planet center (origin)\nconst distance = Math.hypot(x, y);\n\n// Crash occurs if satellite is too close to planet\nreturn distance < planet_radius + crash_threshold + satellite_radius;",
        "transitionKernelCode": "// When satellite crashes into planet, it becomes debris at crash site\nreturn {\n  Debris: [\n    {\n      // Position preserved, direction and velocity zeroed\n      x: input.Space[0].x,\n      y: input.Space[0].y,\n      direction: 0,\n      velocity: 0\n    },\n  ]\n};",
        "x": 270,
        "y": 15
      },
      {
        "id": "transition__c7008acb-b0e7-468e-a5d3-d56eaa1fe806",
        "name": "LaunchSatellite",
        "description": "Launches a new satellite at the configured rate, placing it at a uniformly sampled angle on the launch altitude with a Gaussian initial velocity.",
        "inputArcs": [],
        "outputArcs": [
          {
            "placeId": "3cbc7944-34cb-4eeb-b779-4e392a171fe1",
            "weight": 1
          }
        ],
        "lambdaType": "stochastic",
        "lambdaCode": "return parameters.launch_rate;",
        "transitionKernelCode": "const { planet_radius, altitude, initial_velocity } = parameters;\n\nconst distance = planet_radius + altitude;\nconst angle = Distribution.Uniform(0, Math.PI * 2);\n\nreturn {\n  Space: [\n    {\n      x: angle.map(a => Math.cos(a) * distance),\n      y: angle.map(a => Math.sin(a) * distance),\n      direction: Distribution.Uniform(0, Math.PI * 2),\n      velocity: Distribution.Gaussian(initial_velocity, initial_velocity * 0.1)\n    }\n  ],\n};",
        "x": -255,
        "y": 30
      }
    ],
    "types": [
      {
        "id": "f8e9d7c6-b5a4-3210-fedc-ba9876543210",
        "name": "Satellite",
        "description": "An orbiting object described by its position relative to the planet centre (x, y), heading, and speed.",
        "iconSlug": "9a8b7c6d-5e4f-3a2b-1c0d-9e8f7a6b5c4d",
        "displayColor": "#1E90FF",
        "elements": [
          {
            "elementId": "2b3c4d5e-6f7a-8b9c-0d1e-2f3a4b5c6d7e",
            "name": "x",
            "type": "real"
          },
          {
            "elementId": "3c4d5e6f-7a8b-9c0d-1e2f-3a4b5c6d7e8f",
            "name": "y",
            "type": "real"
          },
          {
            "elementId": "4d5e6f7a-8b9c-0d1e-2f3a-4b5c6d7e8f9a",
            "name": "direction",
            "type": "real"
          },
          {
            "elementId": "5e6f7a8b-9c0d-1e2f-3a4b-5c6d7e8f9a0b",
            "name": "velocity",
            "type": "real"
          }
        ]
      }
    ],
    "differentialEquations": [
      {
        "id": "1a2b3c4d-5e6f-7890-abcd-1234567890ab",
        "colorId": "f8e9d7c6-b5a4-3210-fedc-ba9876543210",
        "name": "Satellite Orbit Dynamics",
        "code": "// Example of ODE for Satellite in orbit (simplified)\nconst mu = parameters.gravitational_constant; // Gravitational parameter\n\n// Process each token (satellite)\nreturn tokens.map(({ x, y, direction, velocity }) => {\n  const r = Math.hypot(x, y); // Distance to planet center\n\n  // Gravitational acceleration vector (points toward origin)\n  const ax = (-mu * x) / (r * r * r);\n  const ay = (-mu * y) / (r * r * r);\n\n  // Return derivatives for this token\n  return {\n    x: velocity * Math.cos(direction),\n    y: velocity * Math.sin(direction),\n    direction:\n      (-ax * Math.sin(direction) + ay * Math.cos(direction)) / velocity,\n    velocity:\n      ax * Math.cos(direction) + ay * Math.sin(direction),\n  }\n})"
      }
    ],
    "parameters": [
      {
        "id": "6f7a8b9c-0d1e-2f3a-4b5c-6d7e8f9a0b1c",
        "name": "Planet Radius",
        "variableName": "planet_radius",
        "type": "real",
        "defaultValue": "50.0"
      },
      {
        "id": "7a8b9c0d-1e2f-3a4b-5c6d-7e8f9a0b1c2d",
        "name": "Satellite Radius",
        "variableName": "satellite_radius",
        "type": "real",
        "defaultValue": "4.0"
      },
      {
        "id": "8b9c0d1e-2f3a-4b5c-6d7e-8f9a0b1c2d3e",
        "name": "Collision Threshold",
        "variableName": "collision_threshold",
        "type": "real",
        "defaultValue": "10.0"
      },
      {
        "id": "9c0d1e2f-3a4b-5c6d-7e8f-9a0b1c2d3e4f",
        "name": "Crash Threshold",
        "variableName": "crash_threshold",
        "type": "real",
        "defaultValue": "5.0"
      },
      {
        "id": "0d1e2f3a-4b5c-6d7e-8f9a-0b1c2d3e4f5a",
        "name": "Gravitational Constant",
        "variableName": "gravitational_constant",
        "type": "real",
        "defaultValue": "400000.0"
      },
      {
        "id": "1e2f3a4b-5c6d-7e8f-9a0b-1c2d3e4f5a6b",
        "name": "Altitude",
        "variableName": "altitude",
        "type": "real",
        "defaultValue": "40.0"
      },
      {
        "id": "2f3a4b5c-6d7e-8f9a-0b1c-2d3e4f5a6b7c",
        "name": "Launch Rate",
        "variableName": "launch_rate",
        "type": "real",
        "defaultValue": "0.5"
      },
      {
        "id": "3a4b5c6d-7e8f-9a0b-1c2d-3e4f5a6b7c8d",
        "name": "Initial Velocity",
        "variableName": "initial_velocity",
        "type": "real",
        "defaultValue": "67.0"
      }
    ],
    "metrics": [
      {
        "id": "metric__satellites_in_orbit",
        "name": "Satellites in orbit",
        "description": "Number of satellites currently in orbit (the Space place).",
        "code": "return state.places.Space.count;"
      },
      {
        "id": "metric__debris",
        "name": "Debris objects",
        "description": "Number of defunct objects produced by collisions and crashes.",
        "code": "return state.places.Debris.count;"
      },
      {
        "id": "metric__average_orbital_radius",
        "name": "Average orbital radius",
        "description": "Mean distance of orbiting satellites from the planet centre (the origin).",
        "code": "const sats = state.places.Space.tokens;\nif (sats.length === 0) return 0;\nreturn sats.reduce((sum, s) => sum + Math.hypot(s.x, s.y), 0) / sats.length;"
      },
      {
        "id": "metric__average_orbital_speed",
        "name": "Average orbital speed",
        "description": "Mean speed of the satellites currently in orbit.",
        "code": "const sats = state.places.Space.tokens;\nif (sats.length === 0) return 0;\nreturn sats.reduce((sum, s) => sum + s.velocity, 0) / sats.length;"
      }
    ],
    "scenarios": [
      {
        "id": "scenario__moon_orbit",
        "name": "Moon Orbit",
        "description": "Low gravity, small body. Satellites drift in gentle arcs around a lunar-mass body.",
        "scenarioParameters": [
          {
            "type": "real",
            "identifier": "launch_rate",
            "default": 0.3
          },
          {
            "type": "real",
            "identifier": "satellite_initial_altitude",
            "default": 20
          },
          {
            "type": "real",
            "identifier": "satellite_initial_velocity",
            "default": 11
          }
        ],
        "parameterOverrides": {
          "0d1e2f3a-4b5c-6d7e-8f9a-0b1c2d3e4f5a": "5000",
          "6f7a8b9c-0d1e-2f3a-4b5c-6d7e8f9a0b1c": "14",
          "2f3a4b5c-6d7e-8f9a-0b1c-2d3e4f5a6b7c": "scenario.launch_rate",
          "1e2f3a4b-5c6d-7e8f-9a0b-1c2d3e4f5a6b": "scenario.satellite_initial_altitude",
          "3a4b5c6d-7e8f-9a0b-1c2d-3e4f5a6b7c8d": "scenario.satellite_initial_velocity"
        },
        "initialState": {
          "type": "adhoc",
          "content": {
            "variables": [
              {
                "name": "launch_rate",
                "type": "real",
                "expression": "0.3",
                "exposed": true,
                "optimize": null
              },
              {
                "name": "satellite_initial_altitude",
                "type": "real",
                "expression": "20",
                "exposed": true,
                "optimize": null
              },
              {
                "name": "satellite_initial_velocity",
                "type": "real",
                "expression": "11",
                "exposed": true,
                "optimize": null
              }
            ],
            "netParameters": [
              {
                "parameterId": "0d1e2f3a-4b5c-6d7e-8f9a-0b1c2d3e4f5a",
                "expression": "5000",
                "optimize": null
              },
              {
                "parameterId": "6f7a8b9c-0d1e-2f3a-4b5c-6d7e8f9a0b1c",
                "expression": "14",
                "optimize": null
              },
              {
                "parameterId": "2f3a4b5c-6d7e-8f9a-0b1c-2d3e4f5a6b7c",
                "expression": "scenario.launch_rate",
                "optimize": null
              },
              {
                "parameterId": "1e2f3a4b-5c6d-7e8f-9a0b-1c2d3e4f5a6b",
                "expression": "scenario.satellite_initial_altitude",
                "optimize": null
              },
              {
                "parameterId": "3a4b5c6d-7e8f-9a0b-1c2d-3e4f5a6b7c8d",
                "expression": "scenario.satellite_initial_velocity",
                "optimize": null
              }
            ],
            "places": {}
          }
        }
      },
      {
        "id": "scenario__earth_orbit",
        "name": "Earth Orbit",
        "description": "Standard Earth gravity. High orbital velocities with frequent launches into low orbit.",
        "scenarioParameters": [
          {
            "type": "real",
            "identifier": "launch_rate",
            "default": 0.5
          },
          {
            "type": "real",
            "identifier": "satellite_initial_altitude",
            "default": 40
          },
          {
            "type": "real",
            "identifier": "satellite_initial_velocity",
            "default": 67
          }
        ],
        "parameterOverrides": {
          "0d1e2f3a-4b5c-6d7e-8f9a-0b1c2d3e4f5a": "400000",
          "6f7a8b9c-0d1e-2f3a-4b5c-6d7e8f9a0b1c": "50",
          "2f3a4b5c-6d7e-8f9a-0b1c-2d3e4f5a6b7c": "scenario.launch_rate",
          "1e2f3a4b-5c6d-7e8f-9a0b-1c2d3e4f5a6b": "scenario.satellite_initial_altitude",
          "3a4b5c6d-7e8f-9a0b-1c2d-3e4f5a6b7c8d": "scenario.satellite_initial_velocity"
        },
        "initialState": {
          "type": "adhoc",
          "content": {
            "variables": [
              {
                "name": "launch_rate",
                "type": "real",
                "expression": "0.5",
                "exposed": true,
                "optimize": null
              },
              {
                "name": "satellite_initial_altitude",
                "type": "real",
                "expression": "40",
                "exposed": true,
                "optimize": null
              },
              {
                "name": "satellite_initial_velocity",
                "type": "real",
                "expression": "67",
                "exposed": true,
                "optimize": null
              }
            ],
            "netParameters": [
              {
                "parameterId": "0d1e2f3a-4b5c-6d7e-8f9a-0b1c2d3e4f5a",
                "expression": "400000",
                "optimize": null
              },
              {
                "parameterId": "6f7a8b9c-0d1e-2f3a-4b5c-6d7e8f9a0b1c",
                "expression": "50",
                "optimize": null
              },
              {
                "parameterId": "2f3a4b5c-6d7e-8f9a-0b1c-2d3e4f5a6b7c",
                "expression": "scenario.launch_rate",
                "optimize": null
              },
              {
                "parameterId": "1e2f3a4b-5c6d-7e8f-9a0b-1c2d3e4f5a6b",
                "expression": "scenario.satellite_initial_altitude",
                "optimize": null
              },
              {
                "parameterId": "3a4b5c6d-7e8f-9a0b-1c2d-3e4f5a6b7c8d",
                "expression": "scenario.satellite_initial_velocity",
                "optimize": null
              }
            ],
            "places": {}
          }
        }
      },
      {
        "id": "scenario__mars_orbit",
        "name": "Mars Orbit",
        "description": "Intermediate gravity between Moon and Earth. Moderate orbital speeds with a thin atmosphere margin.",
        "scenarioParameters": [
          {
            "type": "real",
            "identifier": "launch_rate",
            "default": 0.4
          },
          {
            "type": "real",
            "identifier": "satellite_initial_altitude",
            "default": 25
          },
          {
            "type": "real",
            "identifier": "satellite_initial_velocity",
            "default": 29
          }
        ],
        "parameterOverrides": {
          "0d1e2f3a-4b5c-6d7e-8f9a-0b1c2d3e4f5a": "43000",
          "6f7a8b9c-0d1e-2f3a-4b5c-6d7e8f9a0b1c": "27",
          "2f3a4b5c-6d7e-8f9a-0b1c-2d3e4f5a6b7c": "scenario.launch_rate",
          "1e2f3a4b-5c6d-7e8f-9a0b-1c2d3e4f5a6b": "scenario.satellite_initial_altitude",
          "3a4b5c6d-7e8f-9a0b-1c2d-3e4f5a6b7c8d": "scenario.satellite_initial_velocity"
        },
        "initialState": {
          "type": "adhoc",
          "content": {
            "variables": [
              {
                "name": "launch_rate",
                "type": "real",
                "expression": "0.4",
                "exposed": true,
                "optimize": null
              },
              {
                "name": "satellite_initial_altitude",
                "type": "real",
                "expression": "25",
                "exposed": true,
                "optimize": null
              },
              {
                "name": "satellite_initial_velocity",
                "type": "real",
                "expression": "29",
                "exposed": true,
                "optimize": null
              }
            ],
            "netParameters": [
              {
                "parameterId": "0d1e2f3a-4b5c-6d7e-8f9a-0b1c2d3e4f5a",
                "expression": "43000",
                "optimize": null
              },
              {
                "parameterId": "6f7a8b9c-0d1e-2f3a-4b5c-6d7e8f9a0b1c",
                "expression": "27",
                "optimize": null
              },
              {
                "parameterId": "2f3a4b5c-6d7e-8f9a-0b1c-2d3e4f5a6b7c",
                "expression": "scenario.launch_rate",
                "optimize": null
              },
              {
                "parameterId": "1e2f3a4b-5c6d-7e8f-9a0b-1c2d3e4f5a6b",
                "expression": "scenario.satellite_initial_altitude",
                "optimize": null
              },
              {
                "parameterId": "3a4b5c6d-7e8f-9a0b-1c2d-3e4f5a6b7c8d",
                "expression": "scenario.satellite_initial_velocity",
                "optimize": null
              }
            ],
            "places": {}
          }
        }
      },
      {
        "id": "scenario__solar_orbit",
        "name": "Solar Orbit",
        "description": "Massive central body with extreme gravity. Satellites need very high velocities to maintain distant orbits.",
        "scenarioParameters": [
          {
            "type": "real",
            "identifier": "launch_rate",
            "default": 0.6
          },
          {
            "type": "real",
            "identifier": "satellite_initial_altitude",
            "default": 50
          },
          {
            "type": "real",
            "identifier": "satellite_initial_velocity",
            "default": 196
          }
        ],
        "parameterOverrides": {
          "0d1e2f3a-4b5c-6d7e-8f9a-0b1c2d3e4f5a": "5000000",
          "6f7a8b9c-0d1e-2f3a-4b5c-6d7e8f9a0b1c": "80",
          "2f3a4b5c-6d7e-8f9a-0b1c-2d3e4f5a6b7c": "scenario.launch_rate",
          "1e2f3a4b-5c6d-7e8f-9a0b-1c2d3e4f5a6b": "scenario.satellite_initial_altitude",
          "3a4b5c6d-7e8f-9a0b-1c2d-3e4f5a6b7c8d": "scenario.satellite_initial_velocity"
        },
        "initialState": {
          "type": "adhoc",
          "content": {
            "variables": [
              {
                "name": "launch_rate",
                "type": "real",
                "expression": "0.6",
                "exposed": true,
                "optimize": null
              },
              {
                "name": "satellite_initial_altitude",
                "type": "real",
                "expression": "50",
                "exposed": true,
                "optimize": null
              },
              {
                "name": "satellite_initial_velocity",
                "type": "real",
                "expression": "196",
                "exposed": true,
                "optimize": null
              }
            ],
            "netParameters": [
              {
                "parameterId": "0d1e2f3a-4b5c-6d7e-8f9a-0b1c2d3e4f5a",
                "expression": "5000000",
                "optimize": null
              },
              {
                "parameterId": "6f7a8b9c-0d1e-2f3a-4b5c-6d7e8f9a0b1c",
                "expression": "80",
                "optimize": null
              },
              {
                "parameterId": "2f3a4b5c-6d7e-8f9a-0b1c-2d3e4f5a6b7c",
                "expression": "scenario.launch_rate",
                "optimize": null
              },
              {
                "parameterId": "1e2f3a4b-5c6d-7e8f-9a0b-1c2d3e4f5a6b",
                "expression": "scenario.satellite_initial_altitude",
                "optimize": null
              },
              {
                "parameterId": "3a4b5c6d-7e8f-9a0b-1c2d-3e4f5a6b7c8d",
                "expression": "scenario.satellite_initial_velocity",
                "optimize": null
              }
            ],
            "places": {}
          }
        }
      },
      {
        "id": "scenario__pre_deployed_constellation",
        "name": "Pre-deployed Constellation",
        "description": "Starts with a configurable number of satellites already in orbit, evenly spaced in a ring around the planet. A dynamic row in the ad-hoc scenario form generates the initial state from the scenario parameters.",
        "scenarioParameters": [
          {
            "type": "integer",
            "identifier": "number_of_satellites",
            "default": 8
          },
          {
            "type": "real",
            "identifier": "initial_altitude",
            "default": 40
          }
        ],
        "parameterOverrides": {},
        "initialState": {
          "type": "adhoc",
          "content": {
            "variables": [
              {
                "name": "number_of_satellites",
                "type": "integer",
                "expression": "8",
                "exposed": true,
                "optimize": null
              },
              {
                "name": "initial_altitude",
                "type": "real",
                "expression": "40",
                "exposed": true,
                "optimize": null
              }
            ],
            "netParameters": [],
            "places": {
              "3cbc7944-34cb-4eeb-b779-4e392a171fe1": {
                "kind": "coloured",
                "variables": [
                  {
                    "name": "distanceToCenter",
                    "type": "real",
                    "expression": "parameters.planet_radius + scenario.initial_altitude",
                    "optimize": null
                  },
                  {
                    "name": "orbitalSpeed",
                    "type": "real",
                    "expression": "Math.sqrt(\n  parameters.gravitational_constant / distanceToCenter,\n)",
                    "optimize": null
                  },
                  {
                    "name": "angle",
                    "type": "real",
                    "expression": "Math.PI * 2 * (i / scenario.number_of_satellites)",
                    "optimize": null
                  }
                ],
                "rows": [
                  {
                    "kind": "template",
                    "count": {
                      "expression": "scenario.number_of_satellites",
                      "optimize": null
                    },
                    "cells": [
                      {
                        "expression": "Math.cos(angle) * distanceToCenter",
                        "optimize": null
                      },
                      {
                        "expression": "Math.sin(angle) * distanceToCenter",
                        "optimize": null
                      },
                      {
                        "expression": "angle + Math.PI / 2",
                        "optimize": null
                      },
                      {
                        "expression": "orbitalSpeed",
                        "optimize": null
                      }
                    ]
                  }
                ],
                "sharedColumns": {}
              }
            }
          }
        }
      }
    ]
  }
}
```
