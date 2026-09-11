use alloc::borrow::Cow;
use core::{fmt, fmt::Display};

pub(crate) struct GroupItem<'text, T> {
    pub data: T,
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
