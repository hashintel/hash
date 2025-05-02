#[derive(Debug, Copy, Clone, PartialEq)]
pub struct Suggestion<T> {
    pub item: T,
    pub score: f64,
}
