#[cfg_attr(feature = "std", allow(unused_imports))]
use alloc::{boxed::Box, format, string::String, vec, vec::Vec};
use core::{
    cell::Cell,
    fmt,
    fmt::{Display, Formatter},
    iter::once,
};

use error_stack::{Frame, Report};
use serde::{
    Serialize, Serializer,
    ser::{Error as _, SerializeMap as _},
};

use crate::error::{Error, ErrorProperties, Id, Namespace, Variant};

struct Message<'a, 'b, E: Variant> {
    context: &'a E,
    properties: &'b <E::Properties as ErrorProperties>::Value<'a>,
}

impl<E: Variant> Display for Message<'_, '_, E> {
    fn fmt(&self, fmt: &mut Formatter<'_>) -> fmt::Result {
        self.context.message(fmt, self.properties)
    }
}

#[derive(serde::Serialize)]
struct SerializeError<'a> {
    namespace: &'static Namespace,
    id: &'static Id,

    properties: Box<dyn erased_serde::Serialize + 'a>,
    message: String,
}

struct SerializeErrorProperties<'a, E: Variant>(
    Cell<Option<<E::Properties as ErrorProperties>::Value<'a>>>,
);

impl<'a, E: Variant> SerializeErrorProperties<'a, E> {
    const fn new(value: <E::Properties as ErrorProperties>::Value<'a>) -> Self {
        Self(Cell::new(Some(value)))
    }
}

impl<E: Variant> Serialize for SerializeErrorProperties<'_, E> {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        let mut map = serializer.serialize_map(None)?;

        let value = self
            .0
            .replace(None)
            .expect("serialize cannot be called multiple times");

        E::Properties::output(value, &mut map).map_err(|err| S::Error::custom(format!("{err}")))?;

        map.end()
    }
}

enum EitherIterator<V, I1: Iterator<Item = V>, I2: Iterator<Item = V>> {
    Left(I1),
    Right(I2),
}

impl<V, I1: Iterator<Item = V>, I2: Iterator<Item = V>> Iterator for EitherIterator<V, I1, I2> {
    type Item = V;

    fn next(&mut self) -> Option<Self::Item> {
        match self {
            Self::Left(it1) => it1.next(),
            Self::Right(it2) => it2.next(),
        }
    }
}

struct StackEntry<'a> {
    head: Vec<&'a Frame>,
    next: Option<&'a Frame>,
}

impl<'a> StackEntry<'a> {
    fn find(self) -> impl IntoIterator<Item = StackEntry<'a>> {
        let mut head = self.head;
        let Some(mut next) = self.next else {
            return EitherIterator::Left(once(StackEntry { head, next: None }));
        };

        while next.sources().len() == 1 {
            head.push(next);
            next = &next.sources()[0];
        }

        head.push(next);

        if next.sources().is_empty() {
            EitherIterator::Left(once(StackEntry { head, next: None }))
        } else {
            EitherIterator::Right(next.sources().iter().rev().map(move |source| StackEntry {
                head: head.clone(),
                next: Some(source),
            }))
        }
    }
}

/// Split the Report into "strains", which are just linear frames, which are used to determine
/// the different errors.
///
/// Example:
///
/// ```text
///     A
///    / \
///   B   C
///  / \  |
/// D   E F
/// ```
///
/// will output:
///
/// ```text
/// [A, B, D]
/// [A, B, E]
/// [A, C, F]
/// ```
struct FrameSplitIterator<'a> {
    stack: Vec<StackEntry<'a>>,
}

impl<'a> FrameSplitIterator<'a> {
    fn new(report: &'a Report<[impl core::error::Error + Send + Sync + 'static]>) -> Self {
        let stack = report
            .current_frames()
            .iter()
            .rev()
            .map(|frame| StackEntry {
                head: vec![],
                next: Some(frame),
            })
            .collect();

        Self { stack }
    }
}

impl<'a> Iterator for FrameSplitIterator<'a> {
    type Item = Vec<&'a Frame>;

    fn next(&mut self) -> Option<Self::Item> {
        loop {
            let next = self.stack.pop()?;

            if next.next.is_none() {
                return Some(next.head);
            }

            self.stack.extend(next.find());
        }
    }
}

/// Divide frames, this looks a every strain and checks and finds the underlying variants
/// Those variants then are extracted, meaning:
///
/// ```text
/// [A, B (Error), C, D (Error)]
/// ```
///
/// turns into:
///
/// ```text
/// [A, B (Error)]
/// [A, B, C, D (Error)]
/// ```
fn divide_frames<'a>(
    frames: impl IntoIterator<Item = Vec<&'a Frame>>,
) -> impl IntoIterator<Item = Vec<&'a Frame>> {
    frames.into_iter().flat_map(move |path: Vec<&'a Frame>| {
        let mut div = vec![];
        let mut walked = vec![];

        for frame in path {
            walked.push(frame);

            if frame.is::<Error>() {
                div.push(walked.clone());
            }
        }

        div
    })
}

fn serialize_report<S: Serializer>(
    report: &Report<[impl core::error::Error + Send + Sync + 'static]>,
    serializer: S,
) -> Result<S::Ok, S::Error> {
    let frames = FrameSplitIterator::new(report);
    let frames = divide_frames(frames);

    serializer.collect_seq(frames.into_iter().filter_map(|stack| {
        let last = stack.last()?;
        let error: &Error = last.downcast_ref()?;

        (error.serialize)(error, stack.as_slice())
    }))
}

pub(super) fn impl_serialize<'a, E: Variant>(
    error: &'a Error,
    stack: &[&'a Frame],
) -> Option<Box<dyn erased_serde::Serialize + 'a>> {
    let context: &E = error.variant.downcast_ref()?;

    let properties = E::Properties::value(stack);

    let fmt = Message {
        context,
        properties: &properties,
    };

    let message = format!("{fmt}");

    Some(Box::new(SerializeError {
        namespace: &E::NAMESPACE,
        id: &E::ID,
        properties: Box::new(SerializeErrorProperties::<E>::new(properties)),
        message,
    }))
}

/// This type facilitates the serialization of [`Report<C>`] into a flat representation which
/// consists of:
///
/// ```json
/// {
///     "namespace": "...",
///     "id": [/* items */],
///     "message": "human readable message",
///     "properties": {
///         /* machine readable additional information */
///     }
/// }
/// ```
///
/// This is done by looking through the [`Report`] and looking at the contexts which are [`Error`],
/// earlier frames are then inspected to generate a tuple of predefined property types.
///
/// These types can then be used to generate a personalized message and will be attached to
/// `properties` with the predefined key.
pub struct Export<C: core::error::Error + Send + Sync + 'static>(Report<[C]>);

impl<C: core::error::Error + Send + Sync + 'static> Export<C> {
    pub(crate) const fn new(report: Report<[C]>) -> Self {
        Self(report)
    }
}

impl<C: core::error::Error + Send + Sync + 'static> Serialize for Export<C> {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serialize_report(&self.0, serializer)
    }
}

#[cfg(test)]
mod tests {
    #[cfg_attr(feature = "std", allow(unused_imports))]
    use alloc::{format, vec, vec::Vec};
    use core::fmt::{Display, Formatter};

    use error_stack::{AttachmentKind, Frame, FrameKind, Report};
    use serde_json::{json, to_value};
    use similar_asserts::assert_serde_eq;

    use crate::{
        Deserialize as _, Number, Reflection as _,
        error::{
            Error, ErrorProperties, ExpectedType, Id, Location, MissingError, NAMESPACE, Namespace,
            ReceivedValue, ReportExt as _, ValueError, Variant, VisitorError,
            serialize::{FrameSplitIterator, divide_frames},
        },
        id,
        schema::visitor::StringSchema,
    };

    #[derive(Debug)]
    struct Printable(&'static str);

    impl Display for Printable {
        fn fmt(&self, fmt: &mut Formatter<'_>) -> core::fmt::Result {
            fmt.write_str(self.0)
        }
    }

    #[derive(Debug)]
    struct Root;

    impl Display for Root {
        fn fmt(&self, fmt: &mut Formatter<'_>) -> core::fmt::Result {
            fmt.write_str("Root Error")
        }
    }

    impl core::error::Error for Root {}

    fn assert_stack(frames: &[&Frame], expect: &[&'static str]) {
        let frames: Vec<_> = frames
            .iter()
            .filter_map(|frame| match frame.kind() {
                FrameKind::Context(context) => Some(format!("{context}")),
                FrameKind::Attachment(AttachmentKind::Printable(printable)) => {
                    Some(format!("{printable}"))
                }
                FrameKind::Attachment(_) => None,
            })
            .collect();

        assert_eq!(frames, expect);
    }

    /// ```text
    ///     A -
    ///    / \  \
    ///   B   C  G
    ///  / \  |
    /// D   E F
    /// ```
    ///
    /// will output:
    ///
    /// ```text
    /// [A, B, D]
    /// [A, B, E]
    /// [A, C, F]
    /// [A, G]
    /// ```
    #[test]
    fn split() {
        let report_f = Report::new(Root).attach_printable(Printable("F"));
        let report_e = Report::new(Root).attach_printable(Printable("E"));
        let mut report_d = Report::new(Root).attach_printable(Printable("D")).expand();

        report_d.push(report_e);

        let mut report_b = report_d.attach_printable(Printable("B"));
        let report_c = report_f.attach_printable(Printable("C"));

        let report_g = Report::new(Root).attach_printable(Printable("G"));

        report_b.push(report_c);
        report_b.push(report_g);

        let report_a = report_b.attach_printable(Printable("A"));

        let stacks: Vec<_> = FrameSplitIterator::new(&report_a).collect();

        assert_stack(&stacks[0], &["A", "B", "D", "Root Error"]);
        assert_stack(&stacks[1], &["A", "B", "E", "Root Error"]);
        assert_stack(&stacks[2], &["A", "C", "F", "Root Error"]);
        assert_stack(&stacks[3], &["A", "G", "Root Error"]);
    }

    #[derive(Debug)]
    struct ErrorY;

    impl Display for ErrorY {
        fn fmt(&self, fmt: &mut Formatter<'_>) -> core::fmt::Result {
            fmt.write_str("Y Error")
        }
    }

    impl core::error::Error for ErrorY {}

    #[derive(Debug)]
    struct ErrorZ;

    impl Display for ErrorZ {
        fn fmt(&self, fmt: &mut Formatter<'_>) -> core::fmt::Result {
            fmt.write_str("Z Error")
        }
    }

    impl Variant for ErrorZ {
        type Properties = ();

        const ID: Id = id!["custom"];
        const NAMESPACE: Namespace = NAMESPACE;

        fn message(
            &self,
            fmt: &mut Formatter,
            _properties: &<Self::Properties as ErrorProperties>::Value<'_>,
        ) -> core::fmt::Result {
            fmt.write_str("Z Error")
        }
    }

    /// ```text
    ///     A - -
    ///    / \  \ \
    ///   B   C  G H
    ///  / \  |  | |
    /// Y   Y Y  Y Y
    /// |   | |  |
    /// Z   E |  Z
    /// |   | |  |
    /// D   Z F  Z
    /// |   | |
    /// Z   Y Z
    /// ```
    ///
    /// Y: `Context`, `!Error`
    /// Z: `Context`, `Error`
    ///
    /// will output:
    ///
    /// ```text
    /// [A, B, Y Error, Z Error]
    /// [A, B, Y Error, Z Error, D, Z Error]
    /// [A, B, Y Error, E, Z Error]
    /// [A, C, Y Error, F, Z Error]
    /// [A, G, Y Error, Z Error]
    /// [A, G, Y Error, Z Error, Z Error]
    /// ```
    #[test]
    fn divide_integration() {
        let mut report_d = Report::new(Error::new(ErrorZ))
            .attach_printable(Printable("D"))
            .change_context(Error::new(ErrorZ))
            .change_context(ErrorY)
            .expand();

        let report_e = Report::new(ErrorY)
            .change_context(Error::new(ErrorZ))
            .attach_printable(Printable("E"))
            .change_context(ErrorY);
        report_d.push(report_e);

        let mut report_b = report_d.attach_printable(Printable("B"));

        let report_c = Report::new(Error::new(ErrorZ))
            .attach_printable(Printable("F"))
            .change_context(ErrorY)
            .attach_printable(Printable("C"));

        let report_g = Report::new(Error::new(ErrorZ))
            .change_context(Error::new(ErrorZ))
            .change_context(ErrorY)
            .attach_printable(Printable("G"));

        let report_h = Report::new(ErrorY).attach_printable(Printable("H"));

        report_b.push(report_c);
        report_b.push(report_g);
        report_b.push(report_h);

        let report_a = report_b.attach_printable(Printable("A"));

        let split = FrameSplitIterator::new(&report_a);
        let frames = divide_frames(split);

        let stacks: Vec<_> = frames.into_iter().collect();

        // [A, B, Y Error, Z Error]
        // [A, B, Y Error, Z Error, D, Z Error]
        // [A, B, Y Error, E, Z Error]
        // [A, C, Y Error, F, Z Error]
        // [A, G, Y Error, Z Error]
        // [A, G, Y Error, Z Error, Z Error]
        assert_stack(&stacks[0], &["A", "B", "Y Error", "Z Error"]);
        assert_stack(
            &stacks[1],
            &["A", "B", "Y Error", "Z Error", "D", "Z Error"],
        );
        assert_stack(&stacks[2], &["A", "B", "Y Error", "E", "Z Error"]);
        assert_stack(&stacks[3], &["A", "C", "Y Error", "F", "Z Error"]);
        assert_stack(&stacks[4], &["A", "G", "Y Error", "Z Error"]);
        assert_stack(&stacks[5], &["A", "G", "Y Error", "Z Error", "Z Error"]);
    }

    #[test]
    fn divide_ignore() {
        let report = Report::new(ErrorY).attach(Printable("A")).expand();
        let split = FrameSplitIterator::new(&report);
        let frames = divide_frames(split);

        assert_eq!(frames.into_iter().count(), 0);
    }

    #[test]
    fn divide_division() {
        let report = Report::new(Error::new(ErrorZ))
            .attach_printable(Printable("A"))
            .attach_printable(Printable("B"))
            .change_context(Error::new(ErrorZ))
            .attach_printable(Printable("C"))
            .attach_printable(Printable("D"))
            .expand();

        let split = FrameSplitIterator::new(&report);
        let mut frames = divide_frames(split).into_iter();

        assert_stack(&frames.next().expect("first chain"), &["D", "C", "Z Error"]);
        assert_stack(
            &frames.next().expect("second chain"),
            &["D", "C", "Z Error", "B", "A", "Z Error"],
        );
    }

    #[test]
    fn serialize_single() {
        // simulates that we expected to receive `id` (of type int) at `.0.a.b`, but did not
        let report = Report::new(Error::new(MissingError))
            .attach(Location::Field("b"))
            .attach(Location::Field("a"))
            .attach(Location::Array(0))
            .attach(ExpectedType::new(Number::reflection()));

        let export = report.export();
        let export = to_value(export).expect("should be ok");

        assert_serde_eq!(
            export,
            json!([{
                "namespace": "deer",
                "id": ["value", "missing"],
                "message": "received no value, but expected value of type number",
                "properties": {
                    "location": [
                        {"type": "array", "value": 0},
                        {"type": "field", "value": "a"},
                        {"type": "field", "value": "b"}
                    ],
                    "expected": {
                      "$defs": {
                          "0000-deer::number::Number": {
                              "type": "number",
                          },
                      },
                      "$ref": "#/$defs/0000-deer::number::Number",
                    }
                }
            }])
        );
    }

    #[test]
    fn serialize_multiple() {
        // simulates that we have two errors:
        // * ValueError: u8 @ `.0.a`, received 256
        // * MissingError: String @`.0.b`, received nothing

        let mut missing = Report::new(Error::new(MissingError))
            .attach(ExpectedType::new(StringSchema::document()))
            .attach(Location::Field("b"))
            .change_context(VisitorError)
            .expand();

        let value = Report::new(Error::new(ValueError))
            .attach(ReceivedValue::new(256_u16))
            .attach(ExpectedType::new(u8::reflection()))
            .attach(Location::Field("a"))
            .change_context(VisitorError);

        missing.push(value);

        let report = missing.attach(Location::Array(0));

        let export = report.export();
        let export = to_value(export).expect("should be ok");

        assert_serde_eq!(
            export,
            json!([{
                "namespace": "deer",
                "id": ["value", "missing"],
                "message": "received no value, but expected value of type string",
                "properties": {
                    "location": [
                        {"type": "array", "value": 0},
                        {"type": "field", "value": "b"}
                    ],
                    "expected": {
                        "$defs": {
                            "0000-deer::schema::visitor::StringSchema": {
                                "type": "string",
                            },
                        },
                        "$ref": "#/$defs/0000-deer::schema::visitor::StringSchema",
                    }
                }
            }, {
                "namespace": "deer",
                "id": ["value"],
                "message": "received value is of correct type (integer), but does not fit constraints",
                "properties": {
                    "location": [
                        {"type": "array", "value": 0},
                        {"type": "field", "value": "a"}
                    ],
                    "received": 256,
                    "expected": {
                        "$defs": {
                            "0000-u8": {
                                "maximum": 255,
                                "minimum": 0,
                                "type": "integer",
                            },
                        },
                        "$ref": "#/$defs/0000-u8",
                    }
                }
            }])
        );
    }
}
