use core::fmt::{self, Display};

/// Displays a leading element before the inner content.
///
/// # Examples
///
/// ```
/// use hashql_core::pretty::display::Leading;
///
/// let prefixed = Leading::new(">>> ", "Hello");
/// assert_eq!(format!("{prefixed}"), ">>> Hello");
/// ```
pub struct Leading<S, T> {
    start: S,
    inner: T,
}

impl<S, T> Leading<S, T> {
    /// Creates a new `Leading` with the given start element and inner content.
    pub const fn new(start: S, inner: T) -> Self {
        Self { start, inner }
    }
}

impl<S, T> Display for Leading<S, T>
where
    S: Display,
    T: Display,
{
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        Display::fmt(&self.start, fmt)?;
        Display::fmt(&self.inner, fmt)
    }
}

/// Displays a trailing element after the inner content.
///
/// # Examples
///
/// ```
/// use hashql_core::pretty::display::Trailing;
///
/// let suffixed = Trailing::new("Hello", "!!!");
/// assert_eq!(format!("{suffixed}"), "Hello!!!");
/// ```
pub struct Trailing<S, T> {
    inner: T,
    end: S,
}

impl<S, T> Trailing<S, T> {
    /// Creates a new `Trailing` with the given inner content and end element.
    pub const fn new(inner: T, end: S) -> Self {
        Self { inner, end }
    }
}

impl<S, T> Display for Trailing<S, T>
where
    S: Display,
    T: Display,
{
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        Display::fmt(&self.inner, fmt)?;
        Display::fmt(&self.end, fmt)
    }
}

/// Displays content between start and end delimiters.
///
/// # Examples
///
/// ```
/// use hashql_core::pretty::display::Delimited;
///
/// let quoted = Delimited::new('"', "Hello World", '"');
/// assert_eq!(format!("{quoted}"), r#""Hello World""#);
/// ```
pub struct Delimited<S, E, T> {
    start: S,
    end: E,
    inner: T,
}

impl<S, E, T> Delimited<S, E, T> {
    /// Creates a new `Delimited` with the given start, inner content, and end elements.
    pub const fn new(start: S, inner: T, end: E) -> Self {
        Self { start, end, inner }
    }
}

impl<S, E, T> Display for Delimited<S, E, T>
where
    S: Display,
    E: Display,
    T: Display,
{
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        Display::fmt(&self.start, fmt)?;
        Display::fmt(&self.inner, fmt)?;
        Display::fmt(&self.end, fmt)
    }
}

/// Displays items with a separator between each item.
///
/// # Examples
///
/// ```
/// use hashql_core::pretty::display::Separated;
///
/// let items = vec!["apple", "banana", "cherry"];
/// let csv = Separated::new(items, ", ");
/// assert_eq!(format!("{csv}"), "apple, banana, cherry");
/// ```
pub struct Separated<S, I> {
    separator: S,
    items: I,
}

impl<S, I> Separated<S, I> {
    /// Creates a new `Separated` with the given items and separator.
    pub const fn new(items: I, separator: S) -> Self {
        Self { separator, items }
    }
}

impl<S, I> Display for Separated<S, I>
where
    S: Display,
    I: IntoIterator<Item: Display> + Clone,
{
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        let mut first = true;
        let items = self.items.clone();

        for item in items {
            if !first {
                Display::fmt(&self.separator, fmt)?;
            }

            Display::fmt(&item, fmt)?;
            first = false;
        }
        Ok(())
    }
}

/// Chains display formatting operations.
///
/// # Examples
///
/// ```
/// use hashql_core::pretty::display::DisplayBuilder;
///
/// let result = DisplayBuilder::new("content")
///     .leading("< ")
///     .trailing(" >")
///     .delimited("[", "]");
/// assert_eq!(format!("{result}"), "[< content >]");
/// ```
pub struct DisplayBuilder<D> {
    inner: D,
}

impl<D> DisplayBuilder<D> {
    /// Creates a new `DisplayBuilder` with the given inner content.
    pub const fn new(inner: D) -> Self {
        Self { inner }
    }

    /// Adds a leading element before the current content.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_core::pretty::display::DisplayBuilder;
    ///
    /// let result = DisplayBuilder::new("world").leading("Hello ");
    /// assert_eq!(format!("{result}"), "Hello world");
    /// ```
    pub fn leading<S>(self, leading: S) -> DisplayBuilder<Leading<S, D>> {
        DisplayBuilder {
            inner: Leading::new(leading, self.inner),
        }
    }

    /// Adds a trailing element after the current content.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_core::pretty::display::DisplayBuilder;
    ///
    /// let result = DisplayBuilder::new("Hello").trailing(" world");
    /// assert_eq!(format!("{result}"), "Hello world");
    /// ```
    pub fn trailing<S>(self, trailing: S) -> DisplayBuilder<Trailing<S, D>> {
        DisplayBuilder {
            inner: Trailing::new(self.inner, trailing),
        }
    }

    /// Wraps the current content with start and end delimiters.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_core::pretty::display::DisplayBuilder;
    ///
    /// let result = DisplayBuilder::new("text").delimited("(", ")");
    /// assert_eq!(format!("{result}"), "(text)");
    /// ```
    pub fn delimited<S, E>(self, start: S, end: E) -> DisplayBuilder<Delimited<S, E, D>> {
        DisplayBuilder {
            inner: Delimited::new(start, self.inner, end),
        }
    }

    /// Treats the current content as items to be separated by the given separator.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_core::pretty::display::DisplayBuilder;
    ///
    /// let items = vec!["a", "b", "c"];
    /// let result = DisplayBuilder::new(items).separated("-");
    /// assert_eq!(format!("{result}"), "a-b-c");
    /// ```
    pub fn separated<S>(self, separator: S) -> DisplayBuilder<Separated<S, D>> {
        DisplayBuilder {
            inner: Separated::new(self.inner, separator),
        }
    }
}

impl<D> Display for DisplayBuilder<D>
where
    D: Display,
{
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        Display::fmt(&self.inner, fmt)
    }
}
