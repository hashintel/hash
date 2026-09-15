//! A labelled item inside a grouped card block.

use alloc::borrow::Cow;
use core::{fmt, fmt::Display};

/// An item rendered under an optional group label.
///
/// A labelled item renders as `label: data`, and an unlabelled one renders its data alone.
pub(crate) struct GroupItem<'text, T> {
    /// The rendered item.
    pub data: T,
    /// The group label, absent for an ungrouped item.
    pub group: Option<Cow<'text, str>>,
}

impl<T: Display> Display for GroupItem<'_, T> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        if let Some(group) = &self.group {
            write!(fmt, "{group}: ")?;
        }

        Display::fmt(&self.data, fmt)
    }
}
