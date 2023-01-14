use core::fmt;

use serde::{
    de::{self, Deserializer, Visitor},
    Deserialize,
};
use serde_json::Value;
use stateful::global::Globals;

use crate::Result;

// TODO: think about creating a system of ConfigProviders whereby packages can depend on them
//   and decrease the amount of assumptions the core engine has to make, for example position
//   correction and neighbor search depend on this config, but this config is useless if those
//   packages are not run

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct AxisBoundary {
    pub min: f64,
    pub max: f64,
}

impl Default for AxisBoundary {
    fn default() -> AxisBoundary {
        AxisBoundary {
            min: f64::NEG_INFINITY,
            max: f64::INFINITY,
        }
    }
}

/// Small newtype wrapper around `f64` to deserialize [`f64::INFINITY`] and [`f64::NEG_INFINITY`].
#[derive(Deserialize)]
#[serde(transparent)]
#[repr(transparent)]
struct Float(#[serde(deserialize_with = "deserialize_float")] f64);

fn deserialize_float<'de, D>(deserializer: D) -> Result<f64, D::Error>
where
    D: Deserializer<'de>,
{
    struct FloatDeserializeVisitor;

    impl<'de> Visitor<'de> for FloatDeserializeVisitor {
        type Value = f64;

        fn expecting(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
            write!(f, "f64")
        }

        fn visit_i64<E>(self, v: i64) -> Result<Self::Value, E>
        where
            E: de::Error,
        {
            self.visit_f64(v as f64)
        }

        fn visit_u64<E>(self, v: u64) -> Result<Self::Value, E>
        where
            E: de::Error,
        {
            self.visit_f64(v as f64)
        }

        fn visit_f64<E>(self, v: f64) -> Result<Self::Value, E>
        where
            E: de::Error,
        {
            Ok(v)
        }

        fn visit_str<E>(self, v: &str) -> Result<Self::Value, E>
        where
            E: de::Error,
        {
            match v {
                "Infinity" => Ok(f64::INFINITY),
                "-Infinity" => Ok(f64::NEG_INFINITY),
                _ => Err(E::invalid_value(de::Unexpected::Str(v), &self)),
            }
        }
    }

    deserializer.deserialize_any(FloatDeserializeVisitor)
}

impl<'de> Deserialize<'de> for AxisBoundary {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        let bounds: [Float; 2] = Deserialize::deserialize(deserializer)?;
        Ok(Self {
            min: bounds[0].0,
            max: bounds[1].0,
        })
    }
}

#[derive(Clone, Copy, PartialEq, Eq, Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WrappingBehavior {
    /// Agents crossing the border re-enter on the other side
    ///
    /// An example would be a 2D surface on a torus
    Continuous,

    /// Agents crossing the border are reflected
    ///
    /// En example would be balls bouncing against a wall
    Reflection,

    /// Agents crossing the border are reflected and offset by half the border width
    ///
    /// An example would be a 2D on a sphere
    OffsetReflection,

    /// No changes in behavior
    ///
    /// Distances are calculated ignoring the size of the board
    NoWrap,
}

impl WrappingBehavior {
    /// Changes wrapping behavior to [`WrappingBehavior::Reflection`] if bounds are not +/- INF.
    fn adjust_for_bound(self, bounds: AxisBoundary) -> Self {
        if bounds.min > f64::NEG_INFINITY
            && bounds.max < f64::INFINITY
            && self == WrappingBehavior::NoWrap
        {
            WrappingBehavior::Reflection
        } else {
            self
        }
    }

    /// Returns a wrapping behavior from a wrapping preset.
    ///
    /// For [`WrappingPreset::Spherical`] and [`WrappingPreset::Torus`] the `wrap_z_modes` is set to
    /// `fallback`.
    fn from_preset(preset: WrappingPreset, fallback: WrappingBehavior) -> [WrappingBehavior; 3] {
        Self::verify_offset_reflection(match preset {
            WrappingPreset::Spherical => [
                WrappingBehavior::Continuous,
                WrappingBehavior::OffsetReflection,
                fallback,
            ],
            WrappingPreset::Torus => [
                WrappingBehavior::Continuous,
                WrappingBehavior::Continuous,
                fallback,
            ],
            WrappingPreset::Continuous => [
                WrappingBehavior::Continuous,
                WrappingBehavior::Continuous,
                WrappingBehavior::Continuous,
            ],
            WrappingPreset::Reflection => [
                WrappingBehavior::Reflection,
                WrappingBehavior::Reflection,
                WrappingBehavior::Reflection,
            ],
        })
    }

    /// Verifies and adjusts for [`OffsetReflection`] in a 3-dimensional wrapping behavior.
    ///
    /// Only **one** [`OffsetReflection`] is allowed and only on the y-axis and z-axis. If
    /// [`OffsetReflection`] is set on axis `n`, then the axis `n-1` is set to [`Continuous`].
    ///
    /// This is related to the way in which the wrapped positions for each agent are calculated.
    /// Each wrap mode is expected to have exactly one wrapped position, but for OffsetReflection,
    /// this is not true: an agent may have two wrapped positions. Implementing the general case
    /// is very computationally expensive. Limiting to only have one OffsetReflection axis makes it
    /// more manageable.
    ///
    /// To understand why OffsetReflection generates two wrapped positions,
    /// look at this example situation:
    ///
    /// ```text
    /// __________________
    /// |        x       |
    /// ```
    ///
    /// the agent "x" is at the middle of the top border of the map. Which
    /// are its wrapped positions? They are:
    ///
    /// ```text
    /// x________________x
    /// |        x       |
    /// ```
    ///
    /// but the algorithm only considers one:
    ///
    /// ```text
    /// x_________________
    /// |        x       |
    /// ```
    ///
    /// The "trick" to overcome this problem is to always consider the axis with
    /// [`OffsetReflection`] before the axis along which the offset happens (which is always the
    /// "previous" one), and to mandate that the offset axis is set to Continuous wrapping mode,
    /// because at that point the other wrap mode kicks in and covers the issue:
    ///
    /// ```text
    /// x________________x
    /// x       |        x       |
    /// ```
    // If it does not make sense, try to answer this question: what algorithm should we use to find
    // all the neighbors of this point:
    //
    // ```text
    // __________________
    // |        x       |
    // ```
    //
    // with all possible combinations of wrapping behaviors? You'll either find a solution that
    // works and you can get rid of this whole comment, or understand what I am trying to say :D
    ///
    /// # Panics
    ///
    /// - if x-wrapping behavior is [`OffsetReflection`]
    /// - if y-wrapping behavior **and** z-wrapping behavior is [`OffsetReflection`]
    ///
    /// [`OffsetReflection`]: Self::OffsetReflection
    /// [`Continuous`]: Self::Continuous
    #[must_use]
    fn verify_offset_reflection(mut behaviors: [WrappingBehavior; 3]) -> [WrappingBehavior; 3] {
        if behaviors[0] == WrappingBehavior::OffsetReflection {
            panic!("HASH does not support OffsetReflection along the x axis");
        }

        if behaviors[1] == WrappingBehavior::OffsetReflection
            && behaviors[2] == WrappingBehavior::OffsetReflection
        {
            panic!("HASH support only one axis with OffsetReflection (either y or z)");
        }

        if behaviors[1] == WrappingBehavior::OffsetReflection {
            behaviors[0] = WrappingBehavior::Continuous;
        }
        if behaviors[2] == WrappingBehavior::OffsetReflection {
            behaviors[1] = WrappingBehavior::Continuous;
        }
        behaviors
    }

    #[must_use]
    fn calculate_wrapping_combinations(behaviors: [WrappingBehavior; 3]) -> usize {
        behaviors.iter().fold(1, |acc, wrap| {
            if let WrappingBehavior::NoWrap = wrap {
                acc
            } else {
                acc * 2
            }
        })
    }
}

impl Default for WrappingBehavior {
    fn default() -> WrappingBehavior {
        WrappingBehavior::NoWrap
    }
}

#[derive(Clone, Copy, PartialEq, Eq, Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WrappingPreset {
    Spherical,
    Torus,
    Continuous,
    Reflection,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DistanceFunction {
    /// The distance function associated with the L-1 norm
    /// Also known as the Taxicab distance - returns the total distance traveled in all axes
    ///
    /// Takes two positions as an array of coordinates
    Manhattan,

    /// The distance function associated with the L-2 norm
    /// Most familiar distance function - is the straightline distance between two points
    ///
    /// Takes two positions as an array of coordinates
    Euclidean,

    /// The distance function associated with the L-2 norm
    /// Most familiar distance function - is the straightline distance between two points
    /// Results are left squared for efficient comparisons
    ///
    /// Takes two positions as an array of coordinates
    EuclideanSquared,

    /// The distance function associated with the infinite norm
    /// In simpler terms - the distance function that returns the largest distance in any given
    /// axes
    ///
    /// Takes two positions as an array of coordinates
    Conway,
}

impl Default for DistanceFunction {
    fn default() -> Self {
        Self::Euclidean
    }
}

impl DistanceFunction {
    fn as_function(self) -> fn(&[f64], &[f64]) -> f64 {
        #[must_use]
        fn conway(a: &[f64], b: &[f64]) -> f64 {
            debug_assert!(a.len() == b.len());
            // zipping lines the two coordinates up in a set of hstacked pairs
            // mapping pulls in each hstack pair and return the abs of their difference
            a.iter()
                .zip(b.iter())
                .map(|(x1, x2)| (*x1 - *x2).abs())
                .fold(0_f64, |a, b| a.max(b))
        }

        #[must_use]
        fn manhattan(a: &[f64], b: &[f64]) -> f64 {
            debug_assert!(a.len() == b.len());
            a.iter()
                .zip(b.iter())
                .map(|(x1, x2)| (*x1 - *x2).abs())
                .fold(0_f64, |acc, add| acc + add)
        }

        #[must_use]
        fn euclidean_squared(a: &[f64], b: &[f64]) -> f64 {
            debug_assert!(a.len() == b.len());
            a.iter()
                .zip(b.iter())
                .map(|(x1, x2)| (*x1 - *x2).powi(2))
                .fold(0_f64, |acc, add| acc + add)
        }

        #[must_use]
        fn euclidean(a: &[f64], b: &[f64]) -> f64 {
            debug_assert!(a.len() == b.len());
            a.iter()
                .zip(b.iter())
                .map(|(x1, x2)| (*x1 - *x2).powi(2))
                .fold(0_f64, |acc, add| acc + add)
                .sqrt()
        }

        match self {
            Self::Manhattan => manhattan,
            Self::Euclidean => euclidean,
            Self::EuclideanSquared => euclidean_squared,
            Self::Conway => conway,
        }
    }
}

/// Configuration of the topology relevant to movement and neighbor calculation
pub struct TopologyConfig {
    /// x/y/z-Dimensions of board associated with "width"/"length"/"height"
    pub bounds: [AxisBoundary; 3],

    /// Determines how agents interact with the boundaries in x/y/z of the simulation associated
    /// with "width"/"length"/"height"
    pub wrap_modes: [WrappingBehavior; 3],

    /// The search radius for the kd-tree distance function
    pub search_radius: Option<f64>,

    /// The type of distance function to be used
    /// Currently can be any of Manhattan, Euclidean, Lnorm(p), and Chebyshev
    pub distance_function: fn(&[f64], &[f64]) -> f64,

    /// Whether or not position and velocity wrapping are enabled by default
    pub move_wrapped_agents: bool,

    /// Cache how many wrapped points we need to calculate
    pub wrapping_combinations: usize,
}

impl Default for TopologyConfig {
    fn default() -> TopologyConfig {
        TopologyConfig {
            bounds: Default::default(),
            wrap_modes: Default::default(),
            search_radius: None,
            distance_function: DistanceFunction::default().as_function(),
            move_wrapped_agents: true,
            wrapping_combinations: 1,
        }
    }
}

impl TopologyConfig {
    /// Creates a topology configuration from [`Globals`].
    ///
    /// If a value is not set, it will fallback as specified in [`TopologyConfig::default()`].
    ///
    /// # Panics
    ///
    /// - if x-wrapping behavior is [`WrappingBehavior::OffsetReflection`]
    /// - if y-wrapping behavior **and** z-wrapping behavior is
    ///   [`WrappingBehavior::OffsetReflection`]
    pub fn from_globals(globals: &Globals) -> Result<Self, serde_json::Error> {
        fn from_json<T>(
            topology: &mut serde_json::Map<String, Value>,
            key: &str,
            fallback: T,
        ) -> Result<T, serde_json::Error>
        where
            T: for<'de> Deserialize<'de>,
        {
            Ok(topology
                .remove(key)
                .map(|value| serde_json::from_value(value))
                .transpose()?
                .unwrap_or(fallback))
        }

        let default = Self::default();
        if let Some(serde_json::Value::Object(mut topology_props)) =
            globals.0.get("topology").cloned()
        {
            let bounds = [
                from_json(&mut topology_props, "x_bounds", default.bounds[0])?,
                from_json(&mut topology_props, "y_bounds", default.bounds[1])?,
                from_json(&mut topology_props, "z_bounds", default.bounds[2])?,
            ];

            let wrap_z_mode = from_json(&mut topology_props, "wrap_z_mode", default.wrap_modes[2])?
                .adjust_for_bound(bounds[2]);

            let wrap_modes =
                if let Some(preset) = from_json(&mut topology_props, "wrapping_preset", None)? {
                    WrappingBehavior::from_preset(preset, wrap_z_mode)
                } else {
                    WrappingBehavior::verify_offset_reflection([
                        from_json(&mut topology_props, "wrap_x_mode", default.wrap_modes[0])?
                            .adjust_for_bound(bounds[0]),
                        from_json(&mut topology_props, "wrap_y_mode", default.wrap_modes[1])?
                            .adjust_for_bound(bounds[1]),
                        wrap_z_mode,
                    ])
                };

            let config = Self {
                bounds,
                wrap_modes,
                wrapping_combinations: WrappingBehavior::calculate_wrapping_combinations(
                    wrap_modes,
                ),
                search_radius: from_json(
                    &mut topology_props,
                    "search_radius",
                    default.search_radius,
                )?,
                distance_function: from_json(
                    &mut topology_props,
                    "distance_function",
                    DistanceFunction::default(),
                )?
                .as_function(),
                move_wrapped_agents: from_json(
                    &mut topology_props,
                    "move_wrapped_agents",
                    default.move_wrapped_agents,
                )?,
            };
            // All keys from the topology object are consumed to check for remaining keys
            for (key, _) in topology_props {
                tracing::warn!("Unused key in topology: \"{key}\"")
            }
            Ok(config)
        } else {
            Ok(default)
        }
    }

    /// Get the halfway axis of dimensions
    #[must_use]
    pub fn get_half_dim(&self, dim: usize) -> f64 {
        self.bounds[dim].max - self.get_dim_size(dim) * 0.5
    }

    /// Get distance between each end of the dimension
    #[must_use]
    pub fn get_dim_size(&self, dim: usize) -> f64 {
        self.bounds[dim].max - self.bounds[dim].min
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    fn assert_equality(lhs: &TopologyConfig, rhs: &TopologyConfig) {
        assert_eq!(lhs.bounds, rhs.bounds);
        assert_eq!(lhs.wrap_modes, rhs.wrap_modes);
        assert_eq!(lhs.wrapping_combinations, rhs.wrapping_combinations);
        assert_eq!(lhs.move_wrapped_agents, rhs.move_wrapped_agents);
        assert_eq!(lhs.search_radius, rhs.search_radius);
    }

    #[test]
    fn test_defaults() {
        assert_equality(
            &TopologyConfig::default(),
            &TopologyConfig::from_globals(&Globals(json!({}))).unwrap(),
        );
        assert_equality(
            &TopologyConfig::default(),
            &TopologyConfig::from_globals(&Globals(json!({"topology": {}}))).unwrap(),
        );
    }

    #[test]
    fn test_axis_boundary() {
        let target = TopologyConfig {
            bounds: [
                AxisBoundary {
                    min: -20.,
                    max: 20.,
                },
                AxisBoundary {
                    min: -40.,
                    max: 40.,
                },
                AxisBoundary::default(),
            ],
            wrap_modes: [
                WrappingBehavior::Reflection,
                WrappingBehavior::Reflection,
                WrappingBehavior::default(),
            ],
            wrapping_combinations: 4,
            ..TopologyConfig::default()
        };
        let from_json = TopologyConfig::from_globals(&Globals(json!({
            "topology": {
                "x_bounds": [-20, 20],
                "y_bounds": [-40, 40],
            }
        })))
        .unwrap();
        assert_equality(&target, &from_json);

        let target = TopologyConfig {
            bounds: [
                AxisBoundary {
                    min: f64::NEG_INFINITY,
                    max: 0.,
                },
                AxisBoundary {
                    min: 0.,
                    max: f64::INFINITY,
                },
                AxisBoundary::default(),
            ],
            ..TopologyConfig::default()
        };
        let from_json = TopologyConfig::from_globals(&Globals(json!({
            "topology": {
                "x_bounds": ["-Infinity", 0],
                "y_bounds": [0, "Infinity"]
            }
        })))
        .unwrap();
        assert_equality(&target, &from_json);
    }

    #[test]
    fn test_search_radius() {
        let target = TopologyConfig {
            search_radius: Some(4.),
            ..TopologyConfig::default()
        };
        let from_json = TopologyConfig::from_globals(&Globals(json!({
            "topology": {
                "search_radius": 4
            }
        })))
        .unwrap();
        assert_equality(&target, &from_json);
    }
}
