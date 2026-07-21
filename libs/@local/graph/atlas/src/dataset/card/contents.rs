use alloc::{
    alloc::{Allocator, Global},
    borrow::Cow,
};
use core::{
    fmt,
    fmt::{Display, Write as _},
};

use super::{
    constraints::{Constraints, EndpointConstraint},
    epilogue::Epilogue,
    example::Example,
    group::GroupItem,
    phrase::Phrase,
    prelude::Prelude,
};

/// One structural removal applied while satisfying a token budget.
#[derive(Debug, Copy, Clone)]
pub(crate) enum TruncationPass {
    DropExampleSlot,
    StripAncestorDetails,
    StripEndpointTypeDetails,
    StripSourceTypeDetails,
    StripTargetTypeDetails,
    DropExampleGroup,
    DropExamplesSection,
    DropAncestorsSection,
}

/// A writer that indents every line it forwards.
struct IndentationWriter<W> {
    writer: W,
    indent: usize,
    at_line_start: bool,
}

impl<W> IndentationWriter<W> {
    const fn new(writer: W, indent: usize) -> Self {
        Self {
            writer,
            indent,
            at_line_start: true,
        }
    }
}

impl<W: fmt::Write> fmt::Write for IndentationWriter<W> {
    #[expect(
        clippy::string_slice,
        reason = "bytes below 0x80 are complete characters in UTF-8, never the interior of a \
                  multi-byte sequence, so every 0x0A offset is a character boundary"
    )]
    fn write_str(&mut self, s: &str) -> fmt::Result {
        let mut previous = 0;
        for newline in memchr::memchr_iter(b'\n', s.as_bytes()) {
            let line = &s[previous..=newline];
            if self.at_line_start && line.len() > 1 {
                write!(self.writer, "{:indent$}", "", indent = self.indent)?;
            }

            self.writer.write_str(line)?;
            self.at_line_start = true;
            previous = newline + 1;
        }

        let rest = &s[previous..];
        if rest.is_empty() {
            return Ok(());
        }

        if self.at_line_start {
            write!(self.writer, "{:indent$}", "", indent = self.indent)?;
            self.at_line_start = false;
        }

        self.writer.write_str(rest)
    }
}

/// A bulleted block: a header line, then one indented item per line.
fn bullets<'this, T: Display>(header: &'this str, items: &'this [T]) -> impl Display {
    fmt::from_fn(move |fmt| {
        writeln!(fmt, "{header}")?;
        let mut writer = IndentationWriter::new(&mut *fmt, 2);
        for item in items {
            writeln!(writer, "- {item}")?;
        }

        Ok(())
    })
}

/// Structured card body; its [`Display`] output is the canonical text.
///
/// Adapters construct the contents directly from their own data: every field is public,
/// [`Phrase::new`] normalizes labelled prose, and [`format::build_card`](super::format::build_card)
/// budgets, renders, and lints the result.
pub(crate) struct CardContents<'text, A: Allocator = Global> {
    pub prelude: Prelude<'text, A>,
    pub ancestors: Vec<Phrase<'text>, A>,

    pub source_types: Vec<Phrase<'text>, A>,
    pub target_types: Vec<Phrase<'text>, A>,

    pub endpoint_constraints: Vec<EndpointConstraint<'text, A>, A>,
    pub constraints: Constraints,

    pub examples: Vec<GroupItem<'text, Example<'text>>, A>,
    pub epilogue: Epilogue<'text>,
}

impl<A: Allocator> CardContents<'_, A> {
    /// Returns the number of examples currently on the card.
    #[inline]
    pub(crate) const fn example_count(&self) -> usize {
        self.examples.len()
    }

    /// Collapses a lone at-most-one-target endpoint constraint into the independent source and
    /// target sections, replacing any adapter-supplied summaries.
    pub(super) fn hoist_simple_pair(&mut self) {
        let [only] = &*self.endpoint_constraints else {
            return;
        };

        if !only.is_simple_pair() {
            return;
        }

        let only = self
            .endpoint_constraints
            .pop()
            .expect("a simple pair holds exactly one constraint");

        self.source_types.clear();
        self.source_types.push(only.source);
        self.target_types = only.targets;
    }

    /// Applies one truncation pass and returns its diagnostic label.
    ///
    /// `None` reports that the pass has nothing left to remove.
    pub(super) fn apply(&mut self, pass: TruncationPass) -> Option<Cow<'static, str>> {
        match pass {
            TruncationPass::DropExampleSlot => self.drop_example_slot(),
            TruncationPass::StripAncestorDetails => {
                strip_tails(&mut self.ancestors, "ancestor_details")
            }
            TruncationPass::StripEndpointTypeDetails => self.strip_endpoint_type_details(),
            TruncationPass::StripSourceTypeDetails => {
                strip_tails(&mut self.source_types, "source_type_details")
            }
            TruncationPass::StripTargetTypeDetails => {
                strip_tails(&mut self.target_types, "target_type_details")
            }
            TruncationPass::DropExampleGroup => self.drop_example_group(),
            TruncationPass::DropExamplesSection => {
                if self.examples.is_empty() {
                    return None;
                }
                self.examples.clear();
                Some(Cow::Borrowed("example_section"))
            }
            TruncationPass::DropAncestorsSection => {
                if self.ancestors.is_empty() {
                    return None;
                }
                self.ancestors.clear();
                Some(Cow::Borrowed("ancestors_section"))
            }
        }
    }

    /// Removes the last example of the largest multi-example group.
    ///
    /// Prefers the latest such group on ties.
    fn drop_example_slot(&mut self) -> Option<Cow<'static, str>> {
        let index = {
            let groups = self.example_groups();
            let largest = groups
                .iter()
                .map(|(_, indices)| indices.len())
                .filter(|size| *size > 1)
                .max()?;
            let (_, indices) = groups
                .iter()
                .rev()
                .find(|(_, indices)| indices.len() == largest)?;

            *indices.last()?
        };

        self.examples.remove(index);
        Some(Cow::Owned(format!("example[{index}]")))
    }

    /// Removes the last whole group while more than one example remains.
    fn drop_example_group(&mut self) -> Option<Cow<'static, str>> {
        if self.examples.len() <= 1 {
            return None;
        }

        let (label, indices, single_group) = {
            let groups = self.example_groups();
            let (label, indices) = groups
                .last()
                .expect("non-empty examples form at least one group");
            (label.map(str::to_owned), indices.clone(), groups.len() == 1)
        };
        if single_group {
            let index = *indices.last().expect("an example group is never empty");
            self.examples.remove(index);
            return Some(Cow::Owned(format!("example[{index}]")));
        }

        for index in indices.iter().rev() {
            self.examples.remove(*index);
        }
        // "None" is the persisted-diagnostic placeholder for an absent
        // group label; existing card rows already carry it.
        Some(Cow::Owned(format!(
            "example_group[{}]",
            label.as_deref().unwrap_or("None")
        )))
    }

    fn strip_endpoint_type_details(&mut self) -> Option<Cow<'static, str>> {
        let mut stripped = false;
        for constraint in &mut self.endpoint_constraints {
            stripped |= constraint.source.strip_tail();
            for target in &mut constraint.targets {
                stripped |= target.strip_tail();
            }
        }

        stripped.then_some(Cow::Borrowed("endpoint_type_details"))
    }

    /// Groups example indices by group label in first-seen order.
    fn example_groups(&self) -> Vec<(Option<&str>, Vec<usize>)> {
        let mut groups: Vec<(Option<&str>, Vec<usize>)> = Vec::new();
        for (index, example) in self.examples.iter().enumerate() {
            let label = example.group.as_deref();
            if let Some((_, indices)) = groups.iter_mut().find(|(existing, _)| *existing == label) {
                indices.push(index);
            } else {
                groups.push((label, vec![index]));
            }
        }
        groups
    }
}

impl<A: Allocator> Display for CardContents<'_, A> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        let Self {
            prelude,
            ancestors,
            source_types,
            target_types,
            endpoint_constraints,
            constraints,
            examples,
            epilogue,
        } = self;

        write!(fmt, "{prelude}")?;

        if !ancestors.is_empty() {
            write!(fmt, "\n{}", bullets("Ancestors:", ancestors))?;
        }
        if !source_types.is_empty() {
            write!(fmt, "\n{}", bullets("Source types:", source_types))?;
        }
        if !target_types.is_empty() {
            write!(fmt, "\n{}", bullets("Target types:", target_types))?;
        }
        if !endpoint_constraints.is_empty() {
            write!(
                fmt,
                "\n{}",
                bullets("Endpoint constraints:", endpoint_constraints)
            )?;
        }
        write!(fmt, "\n{constraints}")?;
        if !examples.is_empty() {
            write!(fmt, "\n{}", bullets("Examples:", examples))?;
        }

        write!(fmt, "\n{epilogue}\n")
    }
}

/// Removes every phrase's removable detail under one diagnostic label.
///
/// `None` reports that no phrase carried detail to remove.
fn strip_tails<A: Allocator>(
    phrases: &mut Vec<Phrase<'_>, A>,
    label: &'static str,
) -> Option<Cow<'static, str>> {
    let mut stripped = false;
    for phrase in phrases {
        stripped |= phrase.strip_tail();
    }

    stripped.then_some(Cow::Borrowed(label))
}
