/// The base error type of `deer`
///
/// This type is used as base for all deserialization errors and is based on
/// [`error_stack::Context`], additional context is supplied via [`Report::attach`], therefore the
/// necessary methods for the base implementations are minimal.
///
/// [`Report::attach`]: error_stack::Report::attach
pub trait Error: error_stack::Context {
    /// Error message that this should encompass, additional context is supported via
    /// [`Report::attach`]
    ///
    /// [`Report::attach`]: error_stack::Report::attach
    fn message(contents: &str) -> Self;
}
