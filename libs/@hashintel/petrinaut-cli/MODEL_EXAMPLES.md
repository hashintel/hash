# Petrinaut CLI model examples

These examples use `PetrinautClient` from
[`examples/python_stdio.py`](./examples/python_stdio.py). Build the CLI first:

```bash
turbo --filter @hashintel/petrinaut-cli build
```

From a script run at the HASH repository root, import the example wrapper with:

```python
import sys
from pathlib import Path

examples = Path("libs/@hashintel/petrinaut-cli/examples").resolve()
sys.path.insert(0, str(examples))

from python_stdio import PetrinautClient
```

Each client owns one long-lived CLI process and one compiled model. Create a
new client when changing models.

## SIR: parameters and uncolored tokens

The SIR model has two parameters, three uncolored places, and one metric.
Uncolored initial states are supplied as token counts.

```python
with PetrinautClient(
    model=Path("libs/@hashintel/petrinaut-cli/examples/sir-model.json")
) as client:
    result = client.run(
        parameters={
            "infection_rate": 1.5,
            "recovery_rate": 0.8,
        },
        initialState={
            "Susceptible": 990,
            "Infected": 10,
            "Recovered": 0,
        },
        metrics=["Infected Fraction"],
        maxSteps=100,
        dt=0.1,
        seed=4242,
    )

    infected_fraction = result["metrics"]["Infected Fraction"]
```

## Satellite launcher: multiple colored tokens

`Space` and `Debris` contain `Satellite` tokens. Each token supplies the
attributes defined by that color: `x`, `y`, `direction`, and `velocity`.

```python
with PetrinautClient(
    model=Path(
        "libs/@hashintel/petrinaut-cli/examples/satellites-launcher.json"
    )
) as client:
    result = client.run(
        parameters={
            "gravitational_constant": 400_000,
            "satellite_radius": 4,
        },
        initialState={
            "Space": [
                {"x": 90, "y": 0, "direction": 1.5708, "velocity": 67},
                {"x": -90, "y": 0, "direction": -1.5708, "velocity": 67},
            ],
            "Debris": [],
        },
        metrics=["Satellites in orbit", "Average orbital speed"],
        maxSteps=100,
        dt=0.1,
        seed=4242,
    )

    satellites_in_orbit = result["metrics"]["Satellites in orbit"]
```

An array represents multiple tokens in the same place. All tokens in one place
use that place's color schema.

## Supply chain: uncolored and different colored places

This model combines token counts with several colors. `InboundShipments`,
`OpenOrders`, and `MachineUp` each use a different token schema.

```python
with PetrinautClient(
    model=Path(
        "libs/@hashintel/petrinaut-cli/examples/supply-chain-with-disruption.json"
    )
) as client:
    result = client.run(
        parameters={
            "demand_rate": 0.5,
            "production_rate": 0.9,
            "machine_breakdown_rate": 0.01,
        },
        initialState={
            # Uncolored places use counts.
            "SupplierAAvailable": 1,
            "SupplierBAvailable": 1,
            "RawMaterials": 8,
            "FinishedGoods": 12,
            # Shipment tokens.
            "InboundShipments": [
                {"eta": 2, "risk_score": 0.2, "source": 1, "cost": 16},
                {"eta": 4, "risk_score": 0.4, "source": 2, "cost": 12},
            ],
            # Customer order tokens.
            "OpenOrders": [
                {"age": 1, "priority": 2, "promised_lead_time": 3},
            ],
            # Factory machine tokens.
            "MachineUp": [
                {"health": 0.95, "wear": 0.05},
            ],
        },
        metrics=["Service level", "Factory available"],
        maxSteps=100,
        dt=0.1,
        seed=4242,
    )

    service_level = result["metrics"]["Service level"]
```

## Discovering the expected inputs

Call `metadata` after starting a client:

```python
metadata = client.metadata()

for parameter in metadata["parameters"]:
    print(parameter["variableName"], parameter["type"])

for place in metadata["places"]:
    print(place["name"], place["color"])

for metric in metadata["metrics"]:
    print(metric["id"], metric["name"])
```

Parameters, places, and metrics may be referenced by their IDs or names where
documented. Prefer parameter variable names and place/metric display names in
small Python integrations because they are easier to read.

## Direct JSON-lines usage

The Python wrapper sends the same protocol that can be used directly:

```bash
printf '%s\n' \
  '{"id":1,"method":"run","params":{"initialState":{"Susceptible":990,"Infected":10},"metrics":["Infected Fraction"],"maxSteps":10,"seed":4242}}' \
  | node libs/@hashintel/petrinaut-cli/dist/cli.js serve \
      --model libs/@hashintel/petrinaut-cli/examples/sir-model.json \
      --stdio
```

The process remains available until stdin is closed, so a Python integration
should keep it open and send many requests rather than starting it per run.
