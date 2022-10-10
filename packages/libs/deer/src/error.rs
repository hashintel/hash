pub trait Error: error_stack::Context {
    fn message(contents: &str) -> Self;
}
