from dataclasses import dataclass, field
from typing import Optional, List


@dataclass
class Topology:
    x_bounds: List[float]
    y_bounds: List[float]
    z_bounds: Optional[List[float]] = field(default_factory=lambda: [0.0, 0.0])
