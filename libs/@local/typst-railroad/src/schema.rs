use alloc::borrow::Cow;

use railroad::{
    Choice, Comment, Empty, End, HorizontalGrid, LabeledBox, Link, NonTerminal, Optional, Repeat,
    Sequence, SimpleEnd, SimpleStart, Stack, Start, Terminal, VerticalGrid,
};

/// A syntax-diagram primitive or composite in the JSON input.
#[derive(serde::Deserialize)]
pub(crate) enum Element {
    Choice { children: Vec<Self> },
    Comment { text: String },
    Empty,
    End,
    HorizontalGrid { children: Vec<Self> },
    LabeledBox { label: Box<Self>, inner: Box<Self> },
    Link { uri: String, inner: Box<Self> },
    NonTerminal { label: String },
    Optional { inner: Box<Self> },
    Repeat { inner: Box<Self>, repeat: Box<Self> },
    Sequence { children: Vec<Self> },
    SimpleEnd,
    SimpleStart,
    Stack { children: Vec<Self> },
    Start,
    Terminal { label: String },
    VerticalGrid { children: Vec<Self> },
}

/// A layout-ready syntax-diagram primitive or composite.
pub(crate) enum Node {
    Choice(Choice<Self>),
    Comment(Comment),
    Empty(Empty),
    End(End),
    HorizontalGrid(HorizontalGrid<Self>),
    LabeledBox(LabeledBox<Box<Self>, Box<Self>>),
    Link(Link<Box<Self>>),
    NonTerminal(NonTerminal),
    Optional(Optional<Box<Self>>),
    Repeat(Repeat<Box<Self>, Box<Self>>),
    Sequence(Sequence<Self>),
    SimpleEnd(SimpleEnd),
    SimpleStart(SimpleStart),
    Stack(Stack<Self>),
    Start(Start),
    Terminal(Terminal),
    VerticalGrid(VerticalGrid<Self>),
}

impl railroad::Node for Node {
    fn entry_height(&self) -> i64 {
        match self {
            Self::Choice(inner) => inner.entry_height(),
            Self::Comment(inner) => inner.entry_height(),
            Self::Empty(inner) => inner.entry_height(),
            Self::End(inner) => inner.entry_height(),
            Self::HorizontalGrid(inner) => inner.entry_height(),
            Self::LabeledBox(inner) => inner.entry_height(),
            Self::Link(inner) => inner.entry_height(),
            Self::NonTerminal(inner) => inner.entry_height(),
            Self::Optional(inner) => inner.entry_height(),
            Self::Repeat(inner) => inner.entry_height(),
            Self::Sequence(inner) => inner.entry_height(),
            Self::SimpleEnd(inner) => inner.entry_height(),
            Self::SimpleStart(inner) => inner.entry_height(),
            Self::Stack(inner) => inner.entry_height(),
            Self::Start(inner) => inner.entry_height(),
            Self::Terminal(inner) => inner.entry_height(),
            Self::VerticalGrid(inner) => inner.entry_height(),
        }
    }

    fn height(&self) -> i64 {
        match self {
            Self::Choice(inner) => inner.height(),
            Self::Comment(inner) => inner.height(),
            Self::Empty(inner) => inner.height(),
            Self::End(inner) => inner.height(),
            Self::HorizontalGrid(inner) => inner.height(),
            Self::LabeledBox(inner) => inner.height(),
            Self::Link(inner) => inner.height(),
            Self::NonTerminal(inner) => inner.height(),
            Self::Optional(inner) => inner.height(),
            Self::Repeat(inner) => inner.height(),
            Self::Sequence(inner) => inner.height(),
            Self::SimpleEnd(inner) => inner.height(),
            Self::SimpleStart(inner) => inner.height(),
            Self::Stack(inner) => inner.height(),
            Self::Start(inner) => inner.height(),
            Self::Terminal(inner) => inner.height(),
            Self::VerticalGrid(inner) => inner.height(),
        }
    }

    fn width(&self) -> i64 {
        match self {
            Self::Choice(inner) => inner.width(),
            Self::Comment(inner) => inner.width(),
            Self::Empty(inner) => inner.width(),
            Self::End(inner) => inner.width(),
            Self::HorizontalGrid(inner) => inner.width(),
            Self::LabeledBox(inner) => inner.width(),
            Self::Link(inner) => inner.width(),
            Self::NonTerminal(inner) => inner.width(),
            Self::Optional(inner) => inner.width(),
            Self::Repeat(inner) => inner.width(),
            Self::Sequence(inner) => inner.width(),
            Self::SimpleEnd(inner) => inner.width(),
            Self::SimpleStart(inner) => inner.width(),
            Self::Stack(inner) => inner.width(),
            Self::Start(inner) => inner.width(),
            Self::Terminal(inner) => inner.width(),
            Self::VerticalGrid(inner) => inner.width(),
        }
    }

    fn height_below_entry(&self) -> i64 {
        match self {
            Self::Choice(inner) => inner.height_below_entry(),
            Self::Comment(inner) => inner.height_below_entry(),
            Self::Empty(inner) => inner.height_below_entry(),
            Self::End(inner) => inner.height_below_entry(),
            Self::HorizontalGrid(inner) => inner.height_below_entry(),
            Self::LabeledBox(inner) => inner.height_below_entry(),
            Self::Link(inner) => inner.height_below_entry(),
            Self::NonTerminal(inner) => inner.height_below_entry(),
            Self::Optional(inner) => inner.height_below_entry(),
            Self::Repeat(inner) => inner.height_below_entry(),
            Self::Sequence(inner) => inner.height_below_entry(),
            Self::SimpleEnd(inner) => inner.height_below_entry(),
            Self::SimpleStart(inner) => inner.height_below_entry(),
            Self::Stack(inner) => inner.height_below_entry(),
            Self::Start(inner) => inner.height_below_entry(),
            Self::Terminal(inner) => inner.height_below_entry(),
            Self::VerticalGrid(inner) => inner.height_below_entry(),
        }
    }

    fn draw(&self, x: i64, y: i64, h_dir: railroad::svg::HDir) -> railroad::svg::Element {
        match self {
            Self::Choice(inner) => inner.draw(x, y, h_dir),
            Self::Comment(inner) => inner.draw(x, y, h_dir),
            Self::Empty(inner) => inner.draw(x, y, h_dir),
            Self::End(inner) => inner.draw(x, y, h_dir),
            Self::HorizontalGrid(inner) => inner.draw(x, y, h_dir),
            Self::LabeledBox(inner) => inner.draw(x, y, h_dir),
            Self::Link(inner) => inner.draw(x, y, h_dir),
            Self::NonTerminal(inner) => inner.draw(x, y, h_dir),
            Self::Optional(inner) => inner.draw(x, y, h_dir),
            Self::Repeat(inner) => inner.draw(x, y, h_dir),
            Self::Sequence(inner) => inner.draw(x, y, h_dir),
            Self::SimpleEnd(inner) => inner.draw(x, y, h_dir),
            Self::SimpleStart(inner) => inner.draw(x, y, h_dir),
            Self::Stack(inner) => inner.draw(x, y, h_dir),
            Self::Start(inner) => inner.draw(x, y, h_dir),
            Self::Terminal(inner) => inner.draw(x, y, h_dir),
            Self::VerticalGrid(inner) => inner.draw(x, y, h_dir),
        }
    }
}

impl From<Element> for Node {
    fn from(value: Element) -> Self {
        match value {
            Element::Choice { children } => {
                Self::Choice(children.into_iter().map(Self::from).collect())
            }
            Element::Comment { text } => Self::Comment(Comment::new(text)),
            Element::Empty => Self::Empty(Empty),
            Element::End => Self::End(End),
            Element::HorizontalGrid { children } => Self::HorizontalGrid(HorizontalGrid::new(
                children.into_iter().map(Self::from).collect(),
            )),
            Element::LabeledBox { label, inner } => {
                Self::LabeledBox(LabeledBox::new(inner.into(), label.into()))
            }
            Element::Link { uri, inner } => Self::Link(Link::new(inner.into(), uri)),
            Element::NonTerminal { label } => Self::NonTerminal(NonTerminal::new(label)),
            Element::Optional { inner } => Self::Optional(Optional::new(inner.into())),
            Element::Repeat { inner, repeat } => {
                Self::Repeat(Repeat::new(inner.into(), repeat.into()))
            }
            Element::Sequence { children } => Self::Sequence(Sequence::new(
                children.into_iter().map(Self::from).collect(),
            )),
            Element::SimpleEnd => Self::SimpleEnd(SimpleEnd),
            Element::SimpleStart => Self::SimpleStart(SimpleStart),
            Element::Stack { children } => {
                Self::Stack(Stack::new(children.into_iter().map(Self::from).collect()))
            }
            Element::Start => Self::Start(Start),
            Element::Terminal { label } => Self::Terminal(Terminal::new(label)),
            Element::VerticalGrid { children } => Self::VerticalGrid(VerticalGrid::new(
                children.into_iter().map(Self::from).collect(),
            )),
        }
    }
}

impl From<Box<Element>> for Node {
    fn from(value: Box<Element>) -> Self {
        (*value).into()
    }
}

impl From<Box<Element>> for Box<Node> {
    fn from(value: Box<Element>) -> Self {
        Self::new((*value).into())
    }
}

/// A built-in colour scheme for self-contained SVG images.
#[derive(serde::Deserialize)]
pub(crate) enum BaseStylesheet {
    Light,
    Dark,
}

/// Optional base and custom CSS embedded in an SVG image.
#[derive(serde::Deserialize)]
pub(crate) struct Stylesheet<'source> {
    base: Option<BaseStylesheet>,
    #[serde(borrow)]
    custom: Option<Cow<'source, str>>,
}

/// A JSON diagram with root nodes and optional embedded CSS.
#[derive(serde::Deserialize)]
pub(crate) struct Diagram<'source> {
    #[serde(borrow)]
    pub styles: Stylesheet<'source>,
    pub diagram: Vec<Element>,
}

impl Diagram<'_> {
    /// Arranges root nodes vertically and applies the selected stylesheets.
    pub(crate) fn render(mut self) -> railroad::Diagram<Node> {
        let root = if self.diagram.len() == 1 {
            self.diagram.pop().unwrap_or_else(|| unreachable!())
        } else {
            Element::VerticalGrid {
                children: self.diagram,
            }
        };

        let root: Node = root.into();

        let mut diagram = railroad::Diagram::new(root);
        if let Some(base) = self.styles.base {
            diagram.add_stylesheet(&match base {
                BaseStylesheet::Light => railroad::Stylesheet::Light,
                BaseStylesheet::Dark => railroad::Stylesheet::Dark,
            });
        }

        if let Some(custom) = self.styles.custom {
            diagram.add_css(&custom);
        }

        diagram
    }
}
