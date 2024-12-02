#![expect(
    rustdoc::broken_intra_doc_links,
    reason = "Some structs are not implemented yet and will be added in a follow-up PR"
)]

use alloc::{borrow::Cow, vec::Vec};

#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};

use crate::schema::PropertyBag;

/// Encapsulates a message intended to be read by the end user ([§3.11]).
///
///
/// # General
///
/// Certain objects define messages intended to be viewed by a user. SARIF represents such a message
/// with a message object, which offers the following features:
///
/// - Message strings in plain text (“[plain text messages]”) ([§3.11.3]).
/// - Message strings that incorporate formatting information (“[formatted messages]”) in [GitHub
///   Flavored Markdown][GFM] ([§3.11.4]).
/// - Message strings with [placeholders] for variable information ([§3.11.5]).
/// - Message strings with [embedded links] ([§3.11.6]).
///
///
/// # Constraints
///
/// At least one of the [`text`] ([§3.11.8]) or [`id`] ([§3.11.10]) properties **shall** be present.
///
/// > ## Note
/// >
/// > This ensures that a SARIF consumer can locate the text of the message.
///
///
/// # Plain text messages
/// [plain text messages]: #plain-text-messages
///
/// A plain text message **shall not** contain formatting information, for example, HTML tags or
/// white space whose purpose is to provide indentation or suggest some structure to the message.
///
/// If a plain text message consists of multiple paragraphs, it **may** contain line breaks (for
/// example, `"\r\n"` or `"\n"`, if the SARIF log file is serialized as JSON) to separate the
/// paragraphs. Line breaks **may** follow any convention (for example, `"\n"` or `"\r\n"`). A SARIF
/// post-processor **may** normalize line breaks to any desired convention, including escaping or
/// removing the line breaks so that the entire message renders on a single line.
///
/// The message string **may** contain [placeholders] ([§3.11.5]) and [embedded links] ([§3.11.6]).
///
/// If the message consists of more than one sentence, its first sentence **should** provide a
/// useful summary of the message, suitable for display in cases where UI space is limited.
///
/// > ## Note 1
/// >
/// > If a tool does not construct the message in this way, the initial portion of the message that
/// > a viewer displays where UI space is limited might not be understandable.
///
/// > ## Note 2
/// >
/// > The rationale for these guidelines is that the SARIF format is intended to make it feasible to
/// > merge the outputs of multiple tools into a single user experience. A uniform approach to
/// > message authoring enhances the quality of that experience.
///
/// A SARIF post-processor **should not** modify line break sequences (except perhaps to adapt them
/// to a particular viewing environment).
///
///
/// # Formatted messages
/// [formatted messages]: #formatted-messages
///
/// ## General
///
/// Formatted messages **may** be of arbitrary length and **may** contain formatting information.
/// The message string **may** also contain [placeholders] ([§3.11.5]) and [embedded links]
/// ([§3.11.6]).
///
/// Formatted messages **shall** be expressed in [GitHub-Flavored Markdown][GFM]. Since GFM is a
/// superset of [CommonMark][CMARK], any `CommonMark` Markdown syntax is acceptable.
///
///
/// ## Security implications
///
/// For security reasons, SARIF producers and consumers **shall** adhere to the following:
///
/// - SARIF producers **shall not** emit messages that contain HTML, even though all variants of
///   Markdown permit it.
/// - Deeply nested markup can cause a stack overflow in the [Markdown processor][GFMENG]. To reduce
///   this risk, SARIF consumers **shall** use a Markdown processor that is hardened against such
///   attacks.
///   > ## Note
///   >
///   > One example is the GitHub fork of the [cmark Markdown processor][GFMCMARK].
/// - To reduce the risk posed by possibly malicious SARIF files that do contain arbitrary HTML
///   (including, for example, `javascript:` links), SARIF consumers **shall** either disable HTML
///   processing (for example, by using an option such as the `--safe` option in the cmark Markdown
///   processor) or run the resulting HTML through an HTML sanitizer.
///
/// SARIF consumers that are not prepared to deal with the security implications of formatted
/// messages **shall not** attempt to render them and **shall** instead fall back to the
/// corresponding plain text messages.
///
///
/// # Messages with placeholders
/// [placeholders]: #messages-with-placeholders
///
/// A message string **may** include one or more “placeholders". The syntax of a placeholder is:
///
/// ```ebnf
/// placeholder = "{", index, "}";
///
/// index = non negative integer;
/// ```
///
/// `index` represents a zero-based index into the array of strings contained in the [`arguments`]
/// property ([§3.11.11]).
///
/// When a SARIF consumer displays the message, it **shall** replace every occurrence of the
/// placeholder `{n}` with the string value at index `n` in the [`arguments`] array. Within both
/// plain text and formatted message strings, the characters `“{”` and `“}”` **shall** be
/// represented by the character sequences `“{{”` and `“}}”` respectively.
///
/// Within a given `Message` object:
///
/// - The plain text and formatted message strings **may** contain different numbers of
///   placeholders.
/// - A given placeholder index **shall** have the same meaning in the plain text and formatted
///   message strings (so they can be replaced with the same element of the arguments array).
///
/// > ## Example 1
/// >
/// > Suppose a `Message` object’s [`text`] property ([§3.11.8]) contains this string:
/// >
/// > ```text
/// > "The variable \"{0}\" defined on line {1} is never used. Consider removing \"{0}\"."
/// > ```
/// >
/// > There are two distinct placeholders, `{0}` and `{1}` (although `{0}` occurs twice).
/// > Therefore, the [`arguments`] array will have at least two elements, the first corresponding
/// > to `{0}` and the second corresponding to `{1}`.
///
/// > ## Example 2
/// >
/// > In this example, the SARIF consumer will replace the placeholder `{0}` in `message.text`
/// > with the value `"pBuffer"` from the 0 element of `message.arguments`.
/// <blockquote><pre>
#[cfg_attr(doc, doc = include_str!("doc/3.11.5-example-2.json"))]
/// </pre></blockquote>
///
///
/// # Messages with embedded links
/// [embedded links]: #messages-with-embedded-links
///
/// A message string **may** include one or more links to locations within artifacts mentioned in
/// the enclosing [`Result`] object ([§3.27]). We refer to these links as “embedded links”.
///
/// Within a [formatted message][formatted messages] ([§3.11.4]), an embedded link **shall** conform
/// to the syntax of a [GitHub Flavored Markdown link][GFM] (see [§6.6, “Links”](https://github.github.com/gfm/#links)).
///
/// > ## Note 1
/// >
/// > The GFM link syntax is very flexible. Since a SARIF viewer that renders formatted messages
/// > will presumably rely on a full-featured GFM processor, there is no need to restrict the
/// > embedded link syntax in SARIF formatted messages.
///
/// Within a [plain text message][plain text messages] ([§3.11.3]), an embedded link **shall**
/// conform to the following syntax (which is a greatly restricted subset of the GFM link syntax)
/// before JSON encoding:
///
/// ```ebnf
/// escaped link character = "\" | "[" | "]";
///
/// normal link character = ? JSON string character ? – escaped link character;
///
/// link character = normal link character | ("\", escaped link character);
///
/// link text = { link character };
///
/// link destination = ? Any valid URI ?;
///
/// embedded link = "[", link text, "](", link destination, ")";
/// ```
///
/// `link text` is the message text visible to the user.
///
/// Literal square brackets (`"["` and `"]"`) in the link text of a plain text message **shall** be
/// escaped with a backslash ("\").
///
/// > ## Note 2
/// >
/// > When a SARIF log file is serialized as JSON, JSON encoding doubles the backslash.
///
/// > ## Example 1
/// >
/// > Consider this embedded link whose link text contains square brackets and backslashes:
///
/// <blockquote>
/// <pre>
#[cfg_attr(doc, doc = include_str!("doc/3.11.6-example-1.json"))]
/// </pre>
/// </blockquote>
///
/// > A SARIF viewer would render it as follows:
/// > ```text
/// > Prohibited term used in para[0]\spans[2].
/// > ```
///
///
/// Literal square brackets and (doubled) backslashes **may** appear anywhere else in a plain text
/// message without being escaped.
///
/// In both plain text and formatted messages, if `link destination` is a non-negative integer, it
/// **shall** refer to a [`Location`] object ([§3.28]) whose [`id`][`Location::id`] property
/// ([§3.28.2]) equals the value of link destination. In this case, `theResult` **shall**
/// contain exactly one [`Location`] object with that [`id`][`Location::id`].
///
/// > ## Note 3
/// >
/// > Negative values are forbidden because their use would suggest some non-obvious semantic
/// > difference between positive and negative values.
///
/// > ## Example 2
/// >
/// > In this example, a plain text message contains an embedded link to a location with a file. The
/// > [`Result`] object contains exactly one [`Location`] object whose [`id`][`Location::id`]
/// > property matches the `link destination`.
///
/// <blockquote>
/// <pre>
#[cfg_attr(doc, doc = include_str!("doc/3.11.6-example-2.json"))]
/// </pre>
/// </blockquote>
///
/// The `link destination` in embedded links in both plain text messages and formatted messages
/// **may** use the `sarif` URI scheme ([§3.10.3]). This allows a message to refer to any content
/// elsewhere in the SARIF log file.
///
/// > ## Example 1
/// >
/// > A [`Result::message`] ([§3.27.11]) can refer to another result in the same run (or, for that
/// > matter,
/// > in another run within the same log file) as follows:
/// >
/// > ```text
/// > "There was [another result](sarif:/runs/0/results/42) found by this code flow."
/// > ```
/// >
/// > A SARIF viewer executing in an IDE might respond to a click on such a link by selecting the
/// > target result in an error list window and navigating the editor to that result’s location.
///
/// Because the `"sarif"` URI scheme uses JSON pointer [RFC6901], which locates array elements by
/// their array index, these URIs are potentially fragile if the SARIF log file is transformed by a
/// post-processor.
///
/// > ## Example 2
/// >
/// > If a post-processor concatenates two runs into a single log file, the links within the run at
/// > index 1 will be incorrect, and will need to be updated from `"sarif:/runs/0/…" to
/// > "sarif:/runs/1/…"`.
///
/// > ## Example 3
/// >
/// > If a post-processor removes results from a run, any links that refer to results at indices
/// > following the removed results will need to be adjusted. For example,
/// > `sarif:/runs/0/results/54` might need to be adjusted to `sarif:/runs/0/results/42`.
///
/// When a tool displays on the console a result message containing an embedded link, it **may**
/// reformat the link (for example, by removing the square brackets around the `link text`). If the
/// `link destination` is an integer, and hence specifies a [`Location`] object belonging to
/// `theResult` the tool **should** replace the integer with a string representation of the
/// specified location.
///
/// > ## Example 4
/// >
/// > Suppose a tool chooses to display the result message from Example 3, which contains an
/// > integer-valued `link destination`, on the console. The output might be:
/// >
/// > ```text
/// > Tainted data was used. The data came from here: C:\code\input.c(25, 19).
/// > ```
/// >
/// > Note that in addition to providing a string representation of the location, the tool removed
/// > the `[…](…)` link syntax and separated the link text from the location with a colon. Finally,
/// > the tool recognized that the location’s URI used the `file` scheme and chose to display it as
/// > a
/// > file system path rather than a URI.
///
///
/// # Message string lookup
///
/// A `Message` object can directly contain message strings in its [`text`] ([§3.11.8]) and
/// [`markdown`] ([§3.11.9]) properties. It can also indirectly refer to message strings through its
/// [`id`] ([§3.11.10]) property.
///
/// When a SARIF consumer needs to locate a message string from a `Message` object, it **shall**
/// follow the procedure specified in this section. The [`Run`] object **shall** contain enough
/// information for the procedure to succeed.
///
/// The lookup **shall** occur entirely within the context of a single [`ToolComponent`] object
/// ([§3.19]) which we refer to as `theComponent`. If the SARIF consumer is displaying messages in
/// the language specified by [`theRun.language`][`Run::language`] ([§3.14.7]), then `theComponent`
/// is the tool component that defines the message. If the consumer is displaying messages in any
/// other language – in which case a translation ([§3.19.4]) is in use – then `theComponent` is
/// the tool component that contains the translation.
///
/// In this procedure, we refer to the `Message` object whose string is being looked up as
/// `theMessage`.
///
/// At various points in this procedure, we state that the consumer uses an object’s “[`text`]
/// property or [`markdown`] property, as appropriate”. This means that if the consumer can render
/// formatted messages, it **may** use the [`markdown`] property, if present; otherwise it **shall**
/// use the [`text`] property, but if the consumer cannot render formatted messages, it **shall**
/// use the [`text`] property.
///
/// The procedure is:
#[cfg_attr(doc, doc = include_str!("doc/3.11.7-procedure.html"))]
///
/// [`text`]: Self::text
/// [`markdown`]: Self::markdown
/// [`id`]: Self::id
/// [`message`]: Self::id
/// [`arguments`]: Self::arguments
/// [`Location`]: crate::schema::Location
/// [`Location::id`]: crate::schema::Location::id
/// [`Result`]: crate::schema::Result
/// [`Result::message`]: crate::schema::Result::message
/// [`Run`]: crate::schema::Run
/// [`Run::language`]: crate::schema::Run::language
/// [`ToolComponent`]: crate::schema::ToolComponent
///
/// [§3.10.3]: https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html#_Toc34317457
/// [§3.11]: https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html#_Toc34317459
/// [§3.11.3]: https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html#_Toc34317462
/// [§3.11.4]: https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html#_Toc34317463
/// [§3.11.5]: https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html#_Toc34317466
/// [§3.11.6]: https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html#_Toc34317467
/// [§3.11.8]: https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html#_Toc34317469
/// [§3.11.9]: https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html#_Toc34317470
/// [§3.11.10]: https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html#_Toc34317471
/// [§3.11.11]: https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html#_Toc34317472
/// [§3.14.7]: https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html#_Toc34317491
/// [§3.19]: https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html#_Toc34317533
/// [§3.19.4]: https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html#_Toc34317537
/// [§3.27]: https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html#_Toc34317638
/// [§3.27.11]: https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html#_Toc34317649
/// [§3.28]: https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html#_Toc34317670
/// [§3.28.2]: https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html#_Toc34317672
///
/// [CMARK]: https://commonmark.org/
/// [GFM]: https://github.github.com/gfm/
/// [GFMENG]: https://github.github.com/gfm/#engine
/// [GFMCMARK]: https://github.com/github/cmark
/// [RFC6901]: https://tools.ietf.org/html/rfc6901
#[derive(Debug, Clone, PartialEq, Eq)]
#[cfg_attr(
    feature = "serde",
    derive(Serialize, Deserialize),
    serde(rename_all = "camelCase", deny_unknown_fields)
)]
pub struct Message<'s> {
    /// A plain text message string ([§3.11.8]).
    ///
    /// A `Message` object **may** contain a property named `text` whose value is a non-empty
    /// string containing a [plain text message] ([§3.11.3]).
    ///
    /// [plain text message]: #plain-text-messages
    /// [§3.11.3]: https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html#_Toc34317462
    /// [§3.11.8]: https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html#_Toc34317469
    #[cfg_attr(
        feature = "serde",
        serde(
            borrow,
            default,
            skip_serializing_if = "Option::is_none",
            deserialize_with = "crate::serde::optional"
        )
    )]
    pub text: Option<Cow<'s, str>>,

    /// A Markdown formatted message string ([§3.11.9]).
    ///
    /// A `Message` object **may** contain a property named `markdown` whose value is a non-empty
    /// string containing a [formatted message] ([§3.11.4]) expressed in
    /// [GitHub-Flavored Markdown][GFM].
    ///
    /// If the `markdown` property is present, the [`text`] property ([§3.11.8]) **shall** also be
    /// present.
    ///
    /// > ## Note
    /// >
    /// > This ensures that the message is viewable even in contexts that do not support the
    /// > rendering of formatted text.
    ///
    /// SARIF consumers that cannot (or choose not to) render formatted text **shall** ignore the
    /// markdown property and use the text property instead.
    ///
    /// [`text`]: Self::text
    /// [formatted message]: #formatted-messages
    /// [GFM]: https://github.github.com/gfm/
    /// [§3.11.4]: https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html#_Toc34317463
    /// [§3.11.8]: https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html#_Toc34317469
    /// [§3.11.9]: https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html#_Toc34317470
    #[cfg_attr(
        feature = "serde",
        serde(
            borrow,
            default,
            skip_serializing_if = "Option::is_none",
            deserialize_with = "crate::serde::optional"
        )
    )]
    pub markdown: Option<Cow<'s, str>>,

    /// The identifier for this message ([§3.11.10]).
    ///
    /// A `Message` object **may** contain a property named `id` whose value is a non-empty string
    /// containing the identifier for the desired message. See [§3.11.7] for details of the
    /// [message string lookup] procedure.
    ///
    /// [message string lookup]: #message-string-lookup
    /// [§3.11.7]: https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html#_Toc34317468
    /// [§3.11.10]: https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html#_Toc34317471
    #[cfg_attr(
        feature = "serde",
        serde(
            borrow,
            default,
            skip_serializing_if = "Option::is_none",
            deserialize_with = "crate::serde::optional"
        )
    )]
    pub id: Option<Cow<'s, str>>,

    /// An array of strings to substitute into the message string ([§3.11.11]).
    ///
    /// If the message string specified by any of the properties [`text`] ([§3.11.8]), [`markdown`]
    /// ([§3.11.9]), or [`id`] ([§3.11.10]) contains any [placeholders] ([§3.11.5]), the `Message`
    /// object **shall** contain a property named `arguments` whose value is an array of strings.
    /// [§3.11.5] specifies how a SARIF consumer combines the contents of the arguments array
    /// with the message string to construct the message that it presents to the end user, and
    /// provides an example.
    ///
    /// If none of the properties [`text`], [`markdown`], or [`id`] contains any placeholders, then
    /// arguments **may** be absent.
    ///
    /// The `arguments` array **shall** contain as many elements as required by the maximum
    /// placeholder index among all the message strings specified by the [`text`], [`markdown`],
    /// and [`id`] properties.
    ///
    /// > ## Example
    /// >
    /// > If the highest numbered placeholder in the [`text`] message string is `{3}` and the
    /// > highest numbered placeholder in the [`markdown`] message string is `{5}`, the `arguments`
    /// > array must contain at least 6 elements.
    ///
    /// [`text`]: Self::text
    /// [`markdown`]: Self::markdown
    /// [`id`]: Self::id
    /// [placeholders]: #messages-with-placeholders
    /// [§3.11.5]: https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html#_Toc34317466
    /// [§3.11.7]: https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html#_Toc34317468
    /// [§3.11.8]: https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html#_Toc34317469
    /// [§3.11.9]: https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html#_Toc34317470
    /// [§3.11.10]: https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html#_Toc34317471
    /// [§3.11.11]: https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html#_Toc34317472
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "Vec::is_empty")
    )]
    pub arguments: Vec<Cow<'s, str>>,

    /// Key/value pairs that provide additional information about the message.
    ///
    /// See the [`PropertyBag`] object ([§3.8]) for details.
    ///
    /// [§3.11.11]: https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html#_Toc34317448
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "PropertyBag::is_empty")
    )]
    pub properties: PropertyBag<'s>,
}
