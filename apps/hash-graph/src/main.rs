/// Run the HASH Graph binary.
///
/// # Errors
///
/// The process was unable to recover from an error.
pub fn main() -> Result<(), Box<dyn core::error::Error + Send + Sync>> {
    hash_graph::exec()
}
