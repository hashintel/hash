use std::io;

use super::{
    Trial,
    corpus::TrialCorpus,
    group::TrialGroup,
    visit::{Visitor, walk_trial_group},
};
use crate::{
    annotation::directive::RunMode,
    runner::{
        output::{OutputFormat, escape_json},
        ui::common::styles::{BLUE, CYAN, GRAY, GREEN, RED, YELLOW},
    },
};

struct ListTrialsPretty<'graph, W> {
    inner: W,
    current_parent: (&'graph str, bool),
}

impl<'graph, W> Visitor<'graph> for ListTrialsPretty<'graph, W>
where
    W: io::Write,
{
    type Result = io::Result<()>;

    fn visit_trial_group(&mut self, group: &TrialGroup<'graph>) -> Self::Result {
        self.current_parent = (group.metadata.name(), group.ignore);

        walk_trial_group(self, group)
    }

    fn visit_trial(
        &mut self,
        Trial {
            suite: _,
            path: _,
            namespace,
            ignore,
            annotations,
        }: &Trial,
    ) -> Self::Result {
        let (parent, parent_ignore) = self.current_parent;

        match annotations.directive.run {
            RunMode::Pass => write!(self.inner, "[{GREEN}PASS{GREEN:#}]"),
            RunMode::Fail => write!(self.inner, "[{RED}FAIL{RED:#}]"),
            RunMode::Skip { .. } => write!(self.inner, "[{YELLOW}SKIP{YELLOW:#}]"),
        }?;

        write!(self.inner, " {CYAN}{parent}::")?;

        for segment in namespace {
            write!(self.inner, "{segment}::")?;
        }

        write!(
            self.inner,
            "{CYAN:#}{BLUE}{}{BLUE:#}",
            annotations.directive.name
        )?;

        if parent_ignore {
            write!(self.inner, " ({YELLOW}ignored{YELLOW:#} by parent)")?;
        } else if *ignore {
            write!(self.inner, " ({YELLOW}ignored{YELLOW:#})")?;
        } else {
            // Test is not ignored, runs normally
        }

        if let Some(description) = &annotations.directive.description {
            writeln!(self.inner)?;
            description
                .lines()
                .try_for_each(|line| writeln!(self.inner, "    {GRAY}{line}{GRAY:#}"))?;
        }

        Ok(())
    }
}

struct ListTrialsJson<'graph, W> {
    inner: W,
    current_parent: (&'graph str, bool),
}

impl<'graph, W> Visitor<'graph> for ListTrialsJson<'graph, W>
where
    W: io::Write,
{
    type Result = io::Result<()>;

    fn visit_trial_group(&mut self, group: &TrialGroup<'graph>) -> Self::Result {
        self.current_parent = (group.metadata.name(), group.ignore);

        walk_trial_group(self, group)
    }

    fn visit_trial(
        &mut self,
        Trial {
            suite: _,
            path: _,
            namespace,
            ignore,
            annotations,
        }: &Trial,
    ) -> Self::Result {
        let (parent, parent_ignore) = self.current_parent;

        let status = match annotations.directive.run {
            RunMode::Pass => "pass",
            RunMode::Fail => "fail",
            RunMode::Skip { .. } => "skip",
        };

        write!(self.inner, r#"{{"name":""#)?;
        escape_json(&mut self.inner, parent)?;
        write!(self.inner, "::")?;
        for segment in namespace {
            escape_json(&mut self.inner, segment)?;
            write!(self.inner, "::")?;
        }
        escape_json(&mut self.inner, &annotations.directive.name)?;

        let ignored = parent_ignore || *ignore;
        write!(self.inner, r#"","status":"{status}","ignored":{ignored}"#)?;

        if let Some(description) = &annotations.directive.description {
            write!(self.inner, r#","description":""#)?;
            escape_json(&mut self.inner, description)?;
            write!(self.inner, r#"""#)?;
        }

        write!(self.inner, "}}")?;

        Ok(())
    }
}

enum ListTrialsInner<'graph, W> {
    Pretty(ListTrialsPretty<'graph, W>),
    Json(ListTrialsJson<'graph, W>),
}

pub(crate) struct ListTrials<'graph, W> {
    inner: ListTrialsInner<'graph, W>,
}

impl<'graph, W> ListTrials<'graph, W> {
    pub(crate) const fn new(output: W, format: OutputFormat) -> Self {
        match format {
            OutputFormat::Human | OutputFormat::Interactive => ListTrials {
                inner: ListTrialsInner::Pretty(ListTrialsPretty {
                    inner: output,
                    current_parent: ("", false),
                }),
            },
            OutputFormat::Json => ListTrials {
                inner: ListTrialsInner::Json(ListTrialsJson {
                    inner: output,
                    current_parent: ("", false),
                }),
            },
        }
    }

    pub(crate) fn render(&mut self, corpus: &TrialCorpus<'graph>) -> io::Result<()>
    where
        W: io::Write,
    {
        match &mut self.inner {
            ListTrialsInner::Pretty(visitor) => visitor.visit_trial_corpus(corpus),
            ListTrialsInner::Json(visitor) => visitor.visit_trial_corpus(corpus),
        }
    }
}
