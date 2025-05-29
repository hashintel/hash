use core::fmt::{self, Display};

pub struct Leading<S, T> {
    start: S,
    inner: T,
}

impl<S, T> Leading<S, T> {
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

pub struct Trailing<S, T> {
    inner: T,
    end: S,
}

impl<S, T> Trailing<S, T> {
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

pub struct Delimited<S, E, T> {
    start: S,
    end: E,
    inner: T,
}

impl<S, E, T> Delimited<S, E, T> {
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

pub struct Separated<S, I> {
    separator: S,
    items: I,
}

impl<S, I> Separated<S, I> {
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

pub struct DisplayBuilder<D> {
    inner: D,
}

impl<D> DisplayBuilder<D> {
    pub const fn new(inner: D) -> Self {
        Self { inner }
    }

    pub fn leading<S>(self, leading: S) -> DisplayBuilder<Leading<S, D>> {
        DisplayBuilder {
            inner: Leading::new(leading, self.inner),
        }
    }

    pub fn trailing<S>(self, trailing: S) -> DisplayBuilder<Trailing<S, D>> {
        DisplayBuilder {
            inner: Trailing::new(self.inner, trailing),
        }
    }

    pub fn delimited<S, E>(self, start: S, end: E) -> DisplayBuilder<Delimited<S, E, D>> {
        DisplayBuilder {
            inner: Delimited::new(start, self.inner, end),
        }
    }

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
