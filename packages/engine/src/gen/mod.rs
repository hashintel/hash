// These are FlatBuffers generated files for the IPC message format
pub mod batch;
pub mod init;
pub mod language;
pub mod metaversion;
pub mod new_simulation_run;
pub mod package_config;
pub mod runner_error;
pub mod runner_errors;
pub mod runner_msg;
pub mod runner_warning;
pub mod runner_warnings;
pub mod serialized;
pub mod shared_context;
pub mod sync_context;
pub mod sync_state;
pub mod sync_state_interim;
pub mod target;

impl From<crate::types::TaskID> for runner_msg::TaskID {
    fn from(self) -> Self {
        Self(self.to_ne_bytes())
    }
}

impl Into<crate::types::TaskID> for runner_msg::TaskID {
    fn into(self) -> u128 {
        u128::from_ne_bytes(self.0)
    }
}
