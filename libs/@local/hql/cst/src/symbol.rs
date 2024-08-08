use core::{fmt, fmt::Display};

use ecow::EcoString;

// TODO: in the future we might want to use the bump arena here as well.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Symbol(EcoString);

impl Display for Symbol {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        Display::fmt(&self.0, f)
    }
}
