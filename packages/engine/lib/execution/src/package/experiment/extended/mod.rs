mod optimization;

use serde::{Deserialize, Serialize};

pub use self::optimization::{OptimizationExperimentConfig, OptimizationExperimentConfigPayload};

#[derive(Serialize, Deserialize, Eq, PartialEq, Debug, Clone)]
pub enum ExtendedExperimentConfig {
    Optimization(OptimizationExperimentConfig),
}

#[derive(Deserialize, Serialize, Debug, Clone, PartialEq, Eq)]
pub struct PackageDataField {
    pub name: String,
    /// Discrete values to explore
    pub values: Option<Vec<serde_json::Value>>,
    /// A range of values to explore
    pub range: Option<String>,
}

#[derive(Eq, PartialEq, Debug, Clone)]
pub enum MetricObjective {
    Max,
    Min,
    Other(String),
}

impl Serialize for MetricObjective {
    fn serialize<S: serde::Serializer>(&self, ser: S) -> Result<S::Ok, S::Error> {
        ser.serialize_str(match self {
            MetricObjective::Max => "max",
            MetricObjective::Min => "min",
            MetricObjective::Other(s) => s,
        })
    }
}

impl<'de> Deserialize<'de> for MetricObjective {
    fn deserialize<D: ::serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let s = <String>::deserialize(deserializer)?;
        match s.as_str() {
            "max" => Ok(MetricObjective::Max),
            "min" => Ok(MetricObjective::Min),
            _ => Ok(MetricObjective::Other(s)),
        }
    }
}
