use core::fmt::{self, Display, Write as _};

use hashql_core::span::SpanId;
use hashql_diagnostics::{
    DiagnosticIssues, Failure, Status, Success, category::DiagnosticCategory,
};

use super::SuiteDiagnostic;

pub(crate) fn process_status<T, C>(
    output: &mut Vec<SuiteDiagnostic>,
    result: Status<T, C, SpanId>,
) -> Result<T, SuiteDiagnostic>
where
    C: DiagnosticCategory + 'static,
{
    match result {
        Ok(Success { value, advisories }) => {
            output.extend(advisories.generalize().boxed());
            Ok(value)
        }
        Err(Failure { primary, secondary }) => {
            output.extend(secondary.boxed());
            Err(primary.generalize().boxed())
        }
    }
}

pub(crate) fn process_issues<C>(
    output: &mut Vec<SuiteDiagnostic>,
    issues: DiagnosticIssues<C, SpanId>,
) -> Result<(), SuiteDiagnostic>
where
    C: DiagnosticCategory + 'static,
{
    process_status(output, issues.into_status(()))
}

pub(crate) struct Header(&'static str);

impl Header {
    pub(crate) const fn new(title: &'static str) -> Self {
        Self(title)
    }
}

impl Display for Header {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        const HEADER: char = '\u{2550}';

        let len = self.0.len();

        for _ in 0..4 {
            fmt.write_char(HEADER)?;
        }

        write!(fmt, " {} ", self.0)?;

        let remaining = (80_usize - 4).saturating_sub(len + 2);

        for _ in 0..remaining {
            fmt.write_char(HEADER)?;
        }

        Ok(())
    }
}

pub(crate) struct Annotated<T, U> {
    pub content: T,
    pub annotation: U,
}

impl<T, U> Display for Annotated<T, U>
where
    T: Display,
    U: Display,
{
    #[expect(clippy::non_ascii_literal)]
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        #[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
        struct Prefix {
            start: &'static str,
            continuation: &'static str,
        }

        impl Prefix {
            const ANNOTATION: Self = Self {
                start: "└→ ",
                continuation: "   ",
            };
            const CONTENT: Self = Self {
                start: "┌─ ",
                continuation: "│  ",
            };

            const fn select(self, line: usize) -> &'static str {
                if line == 0 {
                    self.start
                } else {
                    self.continuation
                }
            }
        }

        struct Writer<'a, 'b> {
            inner: &'a mut fmt::Formatter<'b>,
            prefix: Prefix,

            line_number: usize,
            pending: bool,
        }

        impl<'a, 'b> Writer<'a, 'b> {
            const fn new(inner: &'a mut fmt::Formatter<'b>, prefix: Prefix) -> Self {
                Self {
                    inner,
                    prefix,

                    line_number: 0,
                    pending: true,
                }
            }

            const fn reset(&mut self, prefix: Prefix) {
                self.prefix = prefix;
                self.line_number = 0;
                self.pending = true;
            }
        }

        impl fmt::Write for Writer<'_, '_> {
            #[expect(clippy::renamed_function_params)]
            fn write_str(&mut self, string: &str) -> fmt::Result {
                let lines = string.split_inclusive('\n');
                for line in lines {
                    if self.pending {
                        self.inner.write_str(self.prefix.select(self.line_number))?;
                    }

                    self.inner.write_str(line)?;

                    if line.ends_with('\n') {
                        self.line_number += 1;
                        self.pending = true;
                    } else {
                        self.pending = false;
                    }
                }

                Ok(())
            }
        }

        let options = fmt.options();

        let mut writer = Writer::new(fmt, Prefix::CONTENT);

        let mut formatter = fmt::Formatter::new(&mut writer, options);
        self.content.fmt(&mut formatter)?;
        writer.write_str("\n")?;

        writer.reset(Prefix::ANNOTATION);

        let mut formatter = fmt::Formatter::new(&mut writer, options);
        self.annotation.fmt(&mut formatter)?;

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    #![expect(clippy::non_ascii_literal)]
    use core::fmt;

    use crate::suite::common::Annotated;

    struct MultipleWrites;

    impl fmt::Display for MultipleWrites {
        fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
            fmt.write_str("foo")?;
            fmt.write_str("bar")?;
            fmt.write_str("hello\nworld")
        }
    }

    /// A simple single-line type for the annotation.
    struct SimpleAnnotation;

    impl fmt::Display for SimpleAnnotation {
        fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
            fmt.write_str("Type")
        }
    }

    #[test]
    fn multiple_writes() {
        let annotated = Annotated {
            content: &MultipleWrites,
            annotation: &SimpleAnnotation,
        };

        let output = format!("{annotated}");
        let expected = "┌─ foobarhello\n│  world\n└→ Type";

        assert_eq!(output, expected);
    }

    #[test]
    fn proper_newline_handling() {
        let annotated = Annotated {
            content: &"first line\nsecond line",
            annotation: &"annotation",
        };

        let output = format!("{annotated}");
        let expected = "┌─ first line\n│  second line\n└→ annotation";

        assert_eq!(output, expected);
    }

    #[test]
    fn single_line_content() {
        let annotated = Annotated {
            content: &"single line",
            annotation: &"type info",
        };

        let output = format!("{annotated}");
        let expected = "┌─ single line\n└→ type info";

        assert_eq!(output, expected);
    }
}
