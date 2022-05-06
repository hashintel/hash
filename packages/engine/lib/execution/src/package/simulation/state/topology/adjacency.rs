use crate::package::simulation::state::topology::{
    Direction, Position, TopologyConfig, WrappingBehavior,
};

/// Wrap the position if the agent is out of bounds
pub fn correct_agent(
    mut pos: Option<&mut Position>,
    mut dir: Option<&mut Direction>,
    topology: &TopologyConfig,
) -> bool {
    let mut position_was_corrected = false;

    if let Some(ref mut pos) = pos {
        for i in 0..=2 {
            let bounds = topology.bounds[i];
            if pos[i] < bounds.min || pos[i] >= bounds.max {
                wrap_pos_coord(pos, i, topology);
                if let Some(ref mut dir) = dir {
                    wrap_dir_coord(dir, i, topology);
                }
                position_was_corrected = true;
            }
        }
    }

    position_was_corrected
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

fn wrap_dir_coord(dir: &mut Direction, i: usize, config: &TopologyConfig) {
    match config.wrap_modes[i] {
        WrappingBehavior::Reflection | WrappingBehavior::OffsetReflection => {
            dir[i] = -dir[i];
        }
        _ => (),
    }
}
