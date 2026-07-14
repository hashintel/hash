//! Structured card rendering and truncation.

use core::fmt::Write as _;

use super::{PhraseInput, RelationCardInput, SentenceSplitter, Truncation};

#[derive(Debug, Clone)]
struct Phrase {
    label: String,
    lead: Option<String>,
    detail: Option<String>,
}

impl Phrase {
    fn make(
        input: PhraseInput<'_>,
        language: &str,
        splitter: &impl SentenceSplitter,
    ) -> Option<Self> {
        let label = collapse_whitespace(input.label);
        if label.is_empty() {
            return None;
        }

        let description = collapse_whitespace(input.description.unwrap_or_default());
        if description.is_empty() {
            return Some(Self {
                label,
                lead: None,
                detail: None,
            });
        }

        let sentences = splitter.split(&description, language);
        let lead = sentences.first().map(|sentence| (*sentence).to_owned());
        let detail = if sentences.len() > 1 {
            Some(sentences[1..].join(" "))
        } else {
            None
        };
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

#[derive(Debug, Clone)]
struct ExampleLine {
    text: String,
    stratum_label: Option<String>,
}

#[derive(Debug, Clone)]
pub(super) struct CardContents {
    prelude: Vec<String>,
    ancestors: Vec<Phrase>,
    source_types: Vec<Phrase>,
    target_types: Vec<Phrase>,
    constraints: Vec<String>,
    examples: Vec<ExampleLine>,
    epilogue: Vec<String>,
}

impl CardContents {
    pub(super) fn make(input: RelationCardInput<'_>, splitter: &impl SentenceSplitter) -> Self {
        let mut prelude = vec![format!("Relation: {}", input.title)];
        if let Some(description) = input
            .description
            .filter(|description| !description.is_empty())
        {
            prelude.push(format!("Description: {description}"));
        }
        if !input.aliases.is_empty() {
            prelude.push("Aliases:".to_owned());
            prelude.extend(input.aliases.iter().map(|alias| format!("  - {alias}")));
        }
        if let Some(inverse) = input
            .inverse
            .and_then(|phrase| Phrase::make(phrase, input.language, splitter))
        {
            let mut line = "Inverse Name: ".to_owned();
            inverse.render_into(&mut line);
            prelude.push(line);
        } else {
            prelude.push("Inverse Name: none recorded".to_owned());
        }

        let ancestors = input
            .ancestors
            .iter()
            .filter_map(|phrase| Phrase::make(*phrase, input.language, splitter))
            .collect();
        let source_types = input
            .source_types
            .iter()
            .filter_map(|phrase| Phrase::make(*phrase, input.language, splitter))
            .collect();
        let target_types = input
            .target_types
            .iter()
            .filter_map(|phrase| Phrase::make(*phrase, input.language, splitter))
            .collect();

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
                stratum_label: example.stratum_label.map(str::to_owned),
            })
            .collect();
        let slug = input
            .slug
            .map_or_else(|| slugify(input.title), str::to_owned);

        Self {
            prelude,
            ancestors,
            source_types,
            target_types,
            constraints,
            examples,
            epilogue: vec![format!("Slug: {slug}")],
        }
    }

    #[inline]
    pub(super) fn example_count(&self) -> usize {
        self.examples.len()
    }

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

    pub(super) fn apply(&mut self, pass: TruncationPass) -> Option<Truncation> {
        match pass {
            TruncationPass::DropExampleSlot => self.drop_example_slot(),
            TruncationPass::StripAncestorDetails => {
                strip_details(&mut self.ancestors).then_some(Truncation::AncestorDetails)
            }
            TruncationPass::StripSourceTypeDetails => {
                strip_details(&mut self.source_types).then_some(Truncation::SourceTypeDetails)
            }
            TruncationPass::StripTargetTypeDetails => {
                strip_details(&mut self.target_types).then_some(Truncation::TargetTypeDetails)
            }
            TruncationPass::DropExampleStratum => self.drop_example_stratum(),
            TruncationPass::DropExamplesSection => {
                if self.examples.is_empty() {
                    None
                } else {
                    self.examples.clear();
                    Some(Truncation::ExamplesSection)
                }
            }
            TruncationPass::DropAncestorsSection => {
                if self.ancestors.is_empty() {
                    None
                } else {
                    self.ancestors.clear();
                    Some(Truncation::AncestorsSection)
                }
            }
        }
    }

    fn drop_example_slot(&mut self) -> Option<Truncation> {
        let groups = example_groups(&self.examples);
        let (_, indices) = groups
            .iter()
            .filter(|(_, indices)| indices.len() > 1)
            .max_by_key(|(_, indices)| indices.len())?;
        let index = *indices
            .last()
            .expect("eligible group should contain examples");
        self.examples.remove(index);
        Some(Truncation::Example { index })
    }

    fn drop_example_stratum(&mut self) -> Option<Truncation> {
        if self.examples.len() <= 1 {
            return None;
        }

        let groups = example_groups(&self.examples);
        let (label, indices) = groups
            .last()
            .map(|(label, indices)| (label.map(str::to_owned), indices.clone()))
            .expect("non-empty examples should form a group");
        if groups.len() == 1 {
            let index = *indices.last().expect("example group should not be empty");
            self.examples.remove(index);
            return Some(Truncation::Example { index });
        }

        for index in indices.iter().rev() {
            self.examples.remove(*index);
        }
        Some(Truncation::ExampleStratum { label })
    }
}

#[derive(Debug, Copy, Clone)]
pub(super) enum TruncationPass {
    DropExampleSlot,
    StripAncestorDetails,
    StripSourceTypeDetails,
    StripTargetTypeDetails,
    DropExampleStratum,
    DropExamplesSection,
    DropAncestorsSection,
}

fn write_string_block(output: &mut String, first: &mut bool, lines: &[String]) {
    if lines.is_empty() {
        return;
    }
    start_block(output, first);
    for line in lines {
        writeln!(output, "{line}").expect("writing to a string should be infallible");
    }
}

fn write_phrase_block(output: &mut String, first: &mut bool, header: &str, phrases: &[Phrase]) {
    if phrases.is_empty() {
        return;
    }
    start_block(output, first);
    writeln!(output, "{header}").expect("writing to a string should be infallible");
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
    writeln!(output, "{header}").expect("writing to a string should be infallible");
    for line in lines {
        writeln!(output, "  - {line}").expect("writing to a string should be infallible");
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

fn strip_details(phrases: &mut [Phrase]) -> bool {
    if !phrases.iter().any(|phrase| phrase.detail.is_some()) {
        return false;
    }
    for phrase in phrases {
        phrase.detail = None;
    }
    true
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

fn slugify(label: &str) -> String {
    let mut slug = String::with_capacity(label.len());
    let mut separator = false;
    for character in label.chars().flat_map(char::to_lowercase) {
        if character.is_ascii_lowercase() || character.is_ascii_digit() {
            if separator && !slug.is_empty() {
                slug.push('-');
            }
            separator = false;
            slug.push(character);
        } else {
            separator = true;
        }
    }
    slug
}

#[inline]
fn flag_value(flag: Option<bool>) -> &'static str {
    match flag {
        Some(true) => "yes",
        Some(false) => "no",
        None => "not recorded",
    }
}
