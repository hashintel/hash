use super::distance::DistanceFn;

#[derive(Clone, Copy, Debug)]
pub struct AxisBoundary {
    pub min: f64,
    pub max: f64,
}

impl std::default::Default for AxisBoundary {
    fn default() -> AxisBoundary {
        AxisBoundary {
            min: std::f64::NEG_INFINITY,
            max: std::f64::INFINITY,
        }
    }
}

/// Configuration of the topology relevant to movemenet and neighbor calculation
pub struct Config {
    /// Dimensions of board associated with "width"
    pub x_bounds: AxisBoundary,

    /// Dimensions of board associated with "length"
    pub y_bounds: AxisBoundary,

    /// Dimensions of board associated with "height"
    pub z_bounds: AxisBoundary,

    /// Determines how agents interact with the boundaries of the simulation associated with "width"
    pub wrap_x_mode: WrappingBehavior,

    /// Determines how agents interact with the boundaries of the simulation associated with "length"
    pub wrap_y_mode: WrappingBehavior,

    /// Determines how agents interact with the boundaries of the simulation associated with "height"
    pub wrap_z_mode: WrappingBehavior,

    /// The search radius for the kd-tree distance function
    pub search_radius: Option<f64>,

    /// The type of distance function to be used
    /// Currently can be any of Manhattan, Euclidean, Lnorm(p), and Chebyshev
    pub distance_function: Box<dyn DistanceFn>,

    /// Whether or not position and velocity wrapping are enabled by default
    pub move_wrapped_agents: bool,

    /// Cache how many wrapped points we need to calculate
    pub wrapping_combinations: usize,
}

impl std::default::Default for Config {
    fn default() -> Config {
        Config {
            x_bounds: AxisBoundary::default(),
            y_bounds: AxisBoundary::default(),
            z_bounds: AxisBoundary::default(),
            wrap_x_mode: WrappingBehavior::default(),
            wrap_y_mode: WrappingBehavior::default(),
            wrap_z_mode: WrappingBehavior::default(),
            search_radius: None,
            distance_function: Box::new(super::distance::functions::conway),
            move_wrapped_agents: true,
            wrapping_combinations: 1,
        }
    }
}

#[derive(Clone, Copy, PartialEq, Debug)]
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

impl std::default::Default for WrappingBehavior {
    fn default() -> WrappingBehavior {
        WrappingBehavior::NoWrap
    }
}

impl WrappingBehavior {
    pub fn from_string<S>(source: S) -> Option<WrappingBehavior>
    where
        S: AsRef<str>,
    {
        Some(match source.as_ref() {
            "continuous" => WrappingBehavior::Continuous,
            "reflection" => WrappingBehavior::Reflection,
            "offset_reflection" => WrappingBehavior::OffsetReflection,
            "none" => WrappingBehavior::NoWrap,
            _ => return None,
        })
    }
}

impl Config {
    /// Get the halfway axis of x dimensions
    #[must_use]
    pub fn get_half_x(&self) -> f64 {
        self.x_bounds.max - (self.x_bounds.max - self.x_bounds.min) * 0.5
    }

    /// Get the halfway axis of x dimensions
    #[must_use]
    pub fn get_half_y(&self) -> f64 {
        self.y_bounds.max - (self.y_bounds.max - self.y_bounds.min) * 0.5
    }

    /// Get the halfway axis of x dimensions
    #[must_use]
    pub fn get_half_z(&self) -> f64 {
        self.z_bounds.max - (self.z_bounds.max - self.z_bounds.min) * 0.5
    }

    /// Get distance between each end of the dimension
    #[must_use]
    pub fn get_x_size(&self) -> f64 {
        self.x_bounds.max - self.x_bounds.min
    }

    /// Get distance between each end of the dimension
    #[must_use]
    pub fn get_y_size(&self) -> f64 {
        self.y_bounds.max - self.y_bounds.min
    }

    /// Get distance between each end of the dimension
    #[must_use]
    pub fn get_z_size(&self) -> f64 {
        self.z_bounds.max - self.z_bounds.min
    }
}
