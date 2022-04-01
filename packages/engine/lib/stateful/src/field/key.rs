use core::fmt;

#[derive(Debug, Clone, Eq, PartialEq, Hash)]
pub struct FieldKey(String);

impl FieldKey {
    /// Returns the key as string
    pub fn value(&self) -> &str {
        &self.0
    }

    /// Returns a string as key
    pub fn new(key: String) -> Self {
        Self(key)
    }
}

impl fmt::Display for FieldKey {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Display::fmt(self.value(), fmt)
    }
}
