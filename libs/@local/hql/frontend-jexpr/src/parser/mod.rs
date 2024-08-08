use core::range::Range;

use hql_span::{TextRange, TextSize};

mod array;
mod error;
mod expr;
mod object;
mod path;
mod signature;
mod stream;
mod string;
mod symbol;
mod r#type;

trait IntoTextRange {
    /// Convert the range into a text range.
    ///
    /// This operation may truncate the range if it is too large.
    // `trunc` used here to correspond to `f32::trunc`
    fn range_trunc(self) -> TextRange;
}

impl IntoTextRange for Range<usize> {
    fn range_trunc(self) -> TextRange {
        TextRange::new(
            TextSize::from(self.start as u32),
            TextSize::from(self.end as u32),
        )
    }
}

impl IntoTextRange for Range<TextSize> {
    fn range_trunc(self) -> TextRange {
        TextRange::new(self.start, self.end)
    }
}

impl IntoTextRange for (usize, usize) {
    fn range_trunc(self) -> TextRange {
        let (start, end) = self;

        Range { start, end }.range_trunc()
    }
}
