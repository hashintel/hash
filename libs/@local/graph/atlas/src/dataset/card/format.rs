//! Structured card body and its structural truncation passes.

use core::fmt::Write as _;

use super::{
    EndpointTypeConstraint, PhraseInput, RelationCardInput, slugify, token::SentenceSplitter,
};

/// A referenced label plus structurally truncatable description.
#[derive(Debug, Clone)]
pub(super) struct Phrase {
    label: String,
    lead: Option<String>,
    detail: Option<String>,
}

impl Phrase {
    /// Normalizes and splits a canonical phrase for rendering.
    ///
    /// Whitespace-only labels yield `None`; the description splits into a
    /// retained lead sentence and removable detail.
    fn make(input: &PhraseInput, language: &str, splitter: &impl SentenceSplitter) -> Option<Self> {
        let label = collapse_whitespace(&input.label);
        if label.is_empty() {
            return None;
        }

        let description = collapse_whitespace(input.description.as_deref().unwrap_or_default());
        if description.is_empty() {
            return Some(Self {
                label,
                lead: None,
                detail: None,
            });
        }

        let sentences = splitter.split(&description, language);
        let lead = sentences.first().map(|sentence| (*sentence).to_owned());
        let detail = (sentences.len() > 1)
            .then(|| sentences[1..].join(" "))
            .filter(|detail| !detail.is_empty());
        Some(Self {
            label,
            lead,
            detail,
        })
    }

    fn render_into(&self, output: &mut String) {
        output.push_str(&self.label);
        if self.lead.is_none() && self.detail.is_none() {
            return;
        }

        output.push_str(" (");
        if let Some(lead) = &self.lead {
            output.push_str(lead);
        }
        if let Some(detail) = &self.detail {
            if self.lead.is_some() {
                output.push(' ');
            }
            output.push_str(detail);
        }
        output.push(')');
    }
}

/// One rendered source-to-allowed-target association.
#[derive(Debug, Clone)]
pub(super) struct EndpointConstraint {
    source_type: Phrase,
    target_types: Vec<Phrase>,
    minimum_targets: Option<usize>,
    maximum_targets: Option<usize>,
}

impl EndpointConstraint {
    fn make(
        input: &EndpointTypeConstraint,
        language: &str,
        splitter: &impl SentenceSplitter,
    ) -> Option<Self> {
        let source_type = Phrase::make(&input.source_type, language, splitter)?;
        Some(Self {
            source_type,
            target_types: input
                .target_types
                .iter()
                .filter_map(|target| Phrase::make(target, language, splitter))
                .collect(),
            minimum_targets: input.minimum_targets,
            maximum_targets: input.maximum_targets,
        })
    }

    fn render_into(&self, output: &mut String) {
        self.source_type.render_into(output);
        output.push_str(" -> ");
        match self.target_types.as_slice() {
            [] => output.push_str("any target type"),
            [only] => only.render_into(output),
            targets => {
                output.push_str("one of: ");
                for (index, target) in targets.iter().enumerate() {
                    if index > 0 {
                        output.push_str(" | ");
                    }
                    target.render_into(output);
                }
            }
        }
        match (self.minimum_targets, self.maximum_targets) {
            (None, None) => {}
            (None, Some(maximum)) => {
                write!(output, " [targets per source: <= {maximum}]")
                    .expect("writing to a string should be infallible");
            }
            (Some(minimum), None) => {
                write!(output, " [targets per source: >= {minimum}]")
                    .expect("writing to a string should be infallible");
            }
            (Some(minimum), Some(maximum)) if minimum == maximum => {
                write!(output, " [targets per source: exactly {minimum}]")
                    .expect("writing to a string should be infallible");
            }
            (Some(minimum), Some(maximum)) => {
                write!(output, " [targets per source: {minimum}..{maximum}]")
                    .expect("writing to a string should be infallible");
            }
        }
    }
}

/// One rendered Examples bullet.
#[derive(Debug, Clone)]
struct ExampleLine {
    text: String,
    stratum_label: Option<String>,
}

/// One structural removal applied while satisfying a token budget.
#[derive(Debug, Copy, Clone)]
pub(super) enum TruncationPass {
    DropExampleSlot,
    StripAncestorDetails,
    StripEndpointTypeDetails,
    StripSourceTypeDetails,
    StripTargetTypeDetails,
    DropExampleStratum,
    DropExamplesSection,
    DropAncestorsSection,
}

/// Structured card body; [`Self::render_into`] is its only text projection.
#[derive(Debug, Clone)]
pub(super) struct CardContents {
    prelude: Vec<String>,
    ancestors: Vec<Phrase>,
    source_types: Vec<Phrase>,
    target_types: Vec<Phrase>,
    endpoint_constraints: Vec<EndpointConstraint>,
    constraints: Vec<String>,
    examples: Vec<ExampleLine>,
    epilogue: Vec<String>,
}

impl CardContents {
    /// Projects a canonical input into structurally truncatable contents.
    pub(super) fn make(input: &RelationCardInput, splitter: &impl SentenceSplitter) -> Self {
        let language = input.language.as_str();

        let mut prelude = vec![format!("Relation: {}", input.title)];
        if let Some(description) = input
            .description
            .as_deref()
            .filter(|description| !description.is_empty())
        {
            prelude.push(format!("Description: {description}"));
        }
        if !input.aliases.is_empty() {
            prelude.push("Aliases:".to_owned());
            prelude.extend(input.aliases.iter().map(|alias| format!("  - {alias}")));
        }
        match input
            .inverse
            .as_ref()
            .and_then(|entry| Phrase::make(entry, language, splitter))
        {
            Some(inverse) => {
                let mut line = "Inverse Name: ".to_owned();
                inverse.render_into(&mut line);
                prelude.push(line);
            }
            None => prelude.push("Inverse Name: none recorded".to_owned()),
        }

        let ancestors = input
            .ancestors
            .iter()
            .filter_map(|entry| Phrase::make(entry, language, splitter))
            .collect();
        let mut source_types: Vec<_> = input
            .source_types
            .iter()
            .filter_map(|entry| Phrase::make(entry, language, splitter))
            .collect();
        let mut target_types: Vec<_> = input
            .target_types
            .iter()
            .filter_map(|entry| Phrase::make(entry, language, splitter))
            .collect();
        let mut paired: Vec<_> = input
            .endpoint_constraints
            .iter()
            .filter_map(|entry| EndpointConstraint::make(entry, language, splitter))
            .collect();

        // A single at-most-one-target pair carries no association a paired
        // block could disambiguate, so it collapses into the legacy
        // independent sections, replacing any adapter-supplied summaries.
        let simple_pair = paired.len() == 1
            && paired.first().is_some_and(|only| {
                only.minimum_targets.is_none() && matches!(only.maximum_targets, None | Some(1))
            });
        let endpoint_constraints = if simple_pair {
            let only = paired
                .pop()
                .expect("a simple pair holds exactly one constraint");
            source_types = vec![only.source_type];
            target_types = only.target_types;
            Vec::new()
        } else {
            paired
        };

        let constraints = vec![
            format!("symmetric? {}", flag_value(input.constraints.symmetric)),
            format!("transitive? {}", flag_value(input.constraints.transitive)),
            format!(
                "single value? {}",
                flag_value(input.constraints.single_value)
            ),
            format!(
                "distinct values? {}",
                flag_value(input.constraints.distinct_values)
            ),
            format!("direction: {}", input.constraints.direction.as_str()),
        ];
        let examples = input
            .examples
            .iter()
            .map(|example| ExampleLine {
                text: format!("{} -> {}", example.subject_label, example.object_label),
                stratum_label: example.stratum_label.clone(),
            })
            .collect();
        let slug = input.slug.clone().unwrap_or_else(|| slugify(&input.title));

        Self {
            prelude,
            ancestors,
            source_types,
            target_types,
            endpoint_constraints,
            constraints,
            examples,
            epilogue: vec![format!("Slug: {slug}")],
        }
    }

    #[inline]
    pub(super) const fn example_count(&self) -> usize {
        self.examples.len()
    }

    /// Renders blank-line-separated blocks with one trailing newline.
    pub(super) fn render_into(&self, output: &mut String) {
        output.clear();
        let mut first_block = true;

        write_string_block(output, &mut first_block, &self.prelude);
        write_phrase_block(output, &mut first_block, "Ancestors:", &self.ancestors);
        write_phrase_block(
            output,
            &mut first_block,
            "Source types:",
            &self.source_types,
        );
        write_phrase_block(
            output,
            &mut first_block,
            "Target types:",
            &self.target_types,
        );

        if !self.endpoint_constraints.is_empty() {
            start_block(output, &mut first_block);
            output.push_str("Endpoint constraints:\n");
            for constraint in &self.endpoint_constraints {
                output.push_str("  - ");
                constraint.render_into(output);
                output.push('\n');
            }
        }

        write_bullet_block(output, &mut first_block, "Constraints:", &self.constraints);

        if !self.examples.is_empty() {
            start_block(output, &mut first_block);
            output.push_str("Examples:\n");
            for example in &self.examples {
                output.push_str("  - ");
                if let Some(stratum) = &example.stratum_label {
                    output.push_str(stratum);
                    output.push_str(": ");
                }
                output.push_str(&example.text);
                output.push('\n');
            }
        }
        write_string_block(output, &mut first_block, &self.epilogue);
    }

    /// Applies one truncation pass and returns its diagnostic label.
    ///
    /// `None` reports that the pass has nothing left to remove.
    pub(super) fn apply(&mut self, pass: TruncationPass) -> Option<String> {
        match pass {
            TruncationPass::DropExampleSlot => self.drop_example_slot(),
            TruncationPass::StripAncestorDetails => {
                strip_details(&mut self.ancestors, "ancestor_details")
            }
            TruncationPass::StripEndpointTypeDetails => self.strip_endpoint_type_details(),
            TruncationPass::StripSourceTypeDetails => {
                strip_details(&mut self.source_types, "source_type_details")
            }
            TruncationPass::StripTargetTypeDetails => {
                strip_details(&mut self.target_types, "target_type_details")
            }
            TruncationPass::DropExampleStratum => self.drop_example_stratum(),
            TruncationPass::DropExamplesSection => {
                if self.examples.is_empty() {
                    return None;
                }
                self.examples.clear();
                Some("example_section".to_owned())
            }
            TruncationPass::DropAncestorsSection => {
                if self.ancestors.is_empty() {
                    return None;
                }
                self.ancestors.clear();
                Some("ancestors_section".to_owned())
            }
        }
    }

    fn drop_example_slot(&mut self) -> Option<String> {
        let index = {
            let groups = example_groups(&self.examples);
            let max_size = groups
                .iter()
                .map(|(_, indices)| indices.len())
                .filter(|size| *size > 1)
                .max()?;
            let (_, indices) = groups
                .iter()
                .rev()
                .find(|(_, indices)| indices.len() == max_size)?;
            *indices.last()?
        };
        self.examples.remove(index);
        Some(format!("example[{index}]"))
    }

    fn drop_example_stratum(&mut self) -> Option<String> {
        if self.examples.len() <= 1 {
            return None;
        }

        let (label, indices, single_group) = {
            let groups = example_groups(&self.examples);
            let (label, indices) = groups
                .last()
                .expect("non-empty examples should form at least one group");
            (label.map(str::to_owned), indices.clone(), groups.len() == 1)
        };
        if single_group {
            let index = *indices
                .last()
                .expect("an example group should not be empty");
            self.examples.remove(index);
            return Some(format!("example[{index}]"));
        }

        for index in indices.iter().rev() {
            self.examples.remove(*index);
        }
        // A missing stratum label renders as "None", matching the diagnostic
        // vocabulary the Python renderer established for persisted rows.
        Some(format!(
            "example_stratum[{}]",
            label.as_deref().unwrap_or("None")
        ))
    }

    fn strip_endpoint_type_details(&mut self) -> Option<String> {
        let has_detail = self.endpoint_constraints.iter().any(|constraint| {
            constraint.source_type.detail.is_some()
                || constraint
                    .target_types
                    .iter()
                    .any(|target| target.detail.is_some())
        });
        if !has_detail {
            return None;
        }

        for constraint in &mut self.endpoint_constraints {
            constraint.source_type.detail = None;
            for target in &mut constraint.target_types {
                target.detail = None;
            }
        }
        Some("endpoint_type_details".to_owned())
    }
}

fn strip_details(phrases: &mut [Phrase], label: &str) -> Option<String> {
    if !phrases.iter().any(|phrase| phrase.detail.is_some()) {
        return None;
    }
    for phrase in phrases {
        phrase.detail = None;
    }
    Some(label.to_owned())
}

/// Groups example indices by stratum label in first-seen order.
fn example_groups(examples: &[ExampleLine]) -> Vec<(Option<&str>, Vec<usize>)> {
    let mut groups: Vec<(Option<&str>, Vec<usize>)> = Vec::new();
    for (index, example) in examples.iter().enumerate() {
        let label = example.stratum_label.as_deref();
        if let Some((_, indices)) = groups.iter_mut().find(|(existing, _)| *existing == label) {
            indices.push(index);
        } else {
            groups.push((label, vec![index]));
        }
    }
    groups
}

fn write_string_block(output: &mut String, first: &mut bool, lines: &[String]) {
    if lines.is_empty() {
        return;
    }
    start_block(output, first);
    for line in lines {
        output.push_str(line);
        output.push('\n');
    }
}

fn write_phrase_block(output: &mut String, first: &mut bool, header: &str, phrases: &[Phrase]) {
    if phrases.is_empty() {
        return;
    }
    start_block(output, first);
    output.push_str(header);
    output.push('\n');
    for phrase in phrases {
        output.push_str("  - ");
        phrase.render_into(output);
        output.push('\n');
    }
}

fn write_bullet_block(output: &mut String, first: &mut bool, header: &str, lines: &[String]) {
    if lines.is_empty() {
        return;
    }
    start_block(output, first);
    output.push_str(header);
    output.push('\n');
    for line in lines {
        output.push_str("  - ");
        output.push_str(line);
        output.push('\n');
    }
}

#[inline]
fn start_block(output: &mut String, first: &mut bool) {
    if *first {
        *first = false;
    } else {
        output.push('\n');
    }
}

fn collapse_whitespace(text: &str) -> String {
    let mut words = text.split_whitespace();
    let Some(first) = words.next() else {
        return String::new();
    };
    let mut collapsed = String::with_capacity(text.len());
    collapsed.push_str(first);
    for word in words {
        collapsed.push(' ');
        collapsed.push_str(word);
    }
    collapsed
}

#[inline]
const fn flag_value(flag: Option<bool>) -> &'static str {
    match flag {
        Some(true) => "yes",
        Some(false) => "no",
        None => "not recorded",
    }
}
