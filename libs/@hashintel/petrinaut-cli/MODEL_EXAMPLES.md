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

## Supply chain profit: an optimization objective

This model is a compact single-stage supply chain with five uncolored places
(`RawInventory`, `FinishedGoods`, `CustomerDemand`, `SoldOrders`, `LostSales`)
and seven parameters. Its `Profit` metric reads the decision parameters
directly, so it returns a single economic objective for each run.

```python
with PetrinautClient(
    model=Path(
        "libs/@hashintel/petrinaut-cli/examples/supply-chain-profit-model.json"
    )
) as client:
    result = client.run(
        parameters={
            "production_rate": 100,
            "reorder_threshold": 160,
            "batch_size": 180,
            "selling_price": 34,
            "expedite_fraction": 0.25,
            "marketing_spend": 20,
            "demand_multiplier": 1,
        },
        initialState={
            # All places are uncolored, so initial state is token counts.
            "RawInventory": 200,
            "FinishedGoods": 100,
            "CustomerDemand": 0,
            "SoldOrders": 0,
            "LostSales": 0,
        },
        metrics=["Profit", "Service level"],
        maxSteps=365,
        dt=0.1,
        seed=1234,
    )

    profit = result["metrics"]["Profit"]
```

Because `Profit` depends on the parameters, sweeping `production_rate`,
`reorder_threshold`, `batch_size`, `selling_price`, `marketing_spend`, and
`expedite_fraction` while fixing `demand_multiplier` searches for the most
profitable operating policy. The CLI runs that search from an optimization
manifest rather than one call at a time -- see
[Running an optimization manifest](./OPTIMIZATION_INTEGRATION.md), which drives
this same model from `supply-chain-profit-optimization.json`.

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
