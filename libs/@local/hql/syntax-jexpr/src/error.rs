use alloc::borrow::Cow;

use hql_diagnostics::category::Category;

pub(crate) const JEXPR_CATEGORY: &Category = &Category {
    id: Cow::Borrowed("jexpr"),
    name: Cow::Borrowed("J-Expr Frontend"),
    parent: None,
};

#[cfg(test)]
pub(crate) mod test {
    use core::fmt::Debug;

    use winnow::{error::ParseError, stream::AsBStr};

    /// Same as a normal parse error, but on debug it will show the `Display` of the input
    ///
    /// This emulates the behavior of `winnow` 0.6
    pub(crate) struct ParseErrorDebug<I, E>(pub ParseError<I, E>);

    impl<I, E> Debug for ParseErrorDebug<I, E>
    where
        I: AsBStr,
        E: Debug,
    {
        fn fmt(&self, fmt: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
            let mut r#struct = fmt.debug_struct("ParseError");

            let input = self.0.input().as_bstr();

            if let Ok(input) = core::str::from_utf8(input) {
                r#struct.field("input", &input);
            } else {
                r#struct.field("input", &input);
            }

            r#struct
                .field("offset", &self.0.offset())
                .field("inner", &self.0.inner())
                .finish()
        }
    }
}
