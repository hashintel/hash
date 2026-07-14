from typing import Literal

type ShellId = Literal["S1", "S2", "S3"]
type FramingId = Literal["F1", "F2", "F3"]
type BundleId = Literal[
    "S1xF1",
    "S1xF2",
    "S1xF3",
    "S2xF1",
    "S2xF2",
    "S2xF3",
    "S3xF1",
    "S3xF2",
    "S3xF3",
]
