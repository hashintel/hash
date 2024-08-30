use hql_span::{TextRange, TextSize};

mod array;
pub(crate) mod error;
mod expr;
mod expr_explicit;
mod object;
mod path;
mod signature;
mod stream;
mod string;
mod symbol;
mod r#type;
mod value;

pub(crate) use self::{expr::parse_expr, stream::TokenStream};

trait IntoTextRange {
    /// Convert the range into a text range.
    ///
    /// This operation may truncate the range if it is too large.
    // `trunc` used here to correspond to `f32::trunc`
    fn range_trunc(self) -> TextRange;
}

impl IntoTextRange for core::ops::Range<usize> {
    #[expect(
        clippy::cast_possible_truncation,
        reason = "The range is always less than `u32::MAX`"
    )]
    fn range_trunc(self) -> TextRange {
        TextRange::new(
            TextSize::from(self.start as u32),
            TextSize::from(self.end as u32),
        )
    }
}

impl IntoTextRange for core::range::Range<usize> {
    #[expect(
        clippy::cast_possible_truncation,
        reason = "The range is always less than `u32::MAX`"
    )]
    fn range_trunc(self) -> TextRange {
        TextRange::new(
            TextSize::from(self.start as u32),
            TextSize::from(self.end as u32),
        )
    }
}

impl IntoTextRange for core::ops::Range<TextSize> {
    fn range_trunc(self) -> TextRange {
        TextRange::new(self.start, self.end)
    }
}

impl IntoTextRange for core::range::Range<TextSize> {
    fn range_trunc(self) -> TextRange {
        TextRange::new(self.start, self.end)
    }
}

impl IntoTextRange for (usize, usize) {
    fn range_trunc(self) -> TextRange {
        let (start, end) = self;

        core::range::Range { start, end }.range_trunc()
    }
}
