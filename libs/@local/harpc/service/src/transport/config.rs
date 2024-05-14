use core::num::NonZero;

use crate::macros::non_zero;

pub struct TransportConfig {
    pub ipc_buffer_size: NonZero<usize>,
}

impl Default for TransportConfig {
    fn default() -> Self {
        Self {
            ipc_buffer_size: non_zero!(16),
        }
    }
}
