pub(crate) mod error;
pub(in crate::ontology) mod raw;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AllOf<T> {
    pub elements: Vec<T>,
}

impl<T> AllOf<T> {
    /// Creates a new `AllOf` from the given vector.
    pub fn new<U: Into<Vec<T>>>(elements: U) -> Self {
        Self {
            elements: elements.into(),
        }
    }

    #[must_use]
    pub fn all_of(&self) -> &[T] {
        &self.elements
    }
}
