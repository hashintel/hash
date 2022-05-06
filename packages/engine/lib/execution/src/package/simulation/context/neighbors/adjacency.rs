use crate::package::simulation::{
    context::neighbors::map::Position,
    state::topology::{TopologyConfig, WrappingBehavior},
};

/// Performs all the bounds checking and shifts points over depending on the topology config
/// Takes in a single position and returns a vector containing all the possible wrapping
/// of that position around the boundaries.
#[must_use]
pub fn wrapped_positions(pos: &Position, topology: &TopologyConfig) -> Vec<Position> {
    let mut all_points = Vec::with_capacity(topology.wrapping_combinations);
    all_points.push(*pos);

    for coord in 0..=2 {
        for i in 0..all_points.len() {
            // Go from z to x: we have to go backward to handle
            // the OffsetReflection case. Look at cfg.rs for more
            // details.
            //
            // Only add to the array if the position will be wrapped.
            if topology.wrap_modes[2 - coord] != WrappingBehavior::NoWrap {
                let mut pos = all_points[i];
                wrap_pos_coord(&mut pos, 2 - coord, topology);
                all_points.push(pos);
            }
        }
    }

    all_points
}

fn wrap_pos_coord(pos: &mut Position, i: usize, config: &TopologyConfig) {
    match config.wrap_modes[i] {
        WrappingBehavior::Continuous => {
            if pos[i] > config.get_half_dim(i) {
                pos[i] -= config.get_dim_size(i);
            } else {
                pos[i] += config.get_dim_size(i);
            }
        }
        WrappingBehavior::Reflection => {
            if pos[i] < config.get_half_dim(i) {
                pos[i] += 2.0 * (config.bounds[i].min - pos[i]);
            } else {
                pos[i] += 2.0 * (config.bounds[i].max - pos[i]) - 1.0;
            }
        }
        WrappingBehavior::OffsetReflection => {
            // we need to reflect along i and offset along j
            let j = if i == 0 { 2 } else { i - 1 };
            if pos[j] < config.get_half_dim(j) {
                pos[j] += config.get_dim_size(j) * 0.5;
            } else {
                pos[j] -= config.get_dim_size(j) * 0.5;
            }
            if pos[i] < config.get_half_dim(i) {
                pos[i] += 2.0 * (config.bounds[i].min - pos[i]);
            } else {
                pos[i] += 2.0 * (config.bounds[i].max - pos[i]) - 1.0;
            }
        }
        WrappingBehavior::NoWrap => (),
    }
}
