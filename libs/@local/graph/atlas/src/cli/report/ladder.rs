//! The ladder report that reads the relation effect in world units and writes one JSON bundle.

use core::fmt::{self, Display};

use camino::Utf8PathBuf;
use clap::{Args, ValueHint};

use super::ReportError;
use crate::{cli::RootArgs, file::generation::GenerationId, salt::ladder::report::LadderReport};

/// Root, generation, and output settings of one ladder report.
#[derive(Debug, Args)]
pub(crate) struct LadderArgs {
    #[command(flatten)]
    root: RootArgs,

    /// Hex identity of the published generation whose ladder this report reads.
    #[arg(long)]
    generation: GenerationId,

    /// Where the report bundle JSON lands.
    #[arg(long, default_value = "ladder-report.json", value_hint = ValueHint::FilePath)]
    output: Utf8PathBuf,
}

/// One ladder reading and where its bundle landed.
#[derive(Debug)]
pub(crate) struct LadderVerdict {
    /// The compiled reading.
    report: LadderReport,
    /// The path the run wrote the report bundle to.
    output: Utf8PathBuf,
}

impl Display for LadderVerdict {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        let report = &self.report;

        writeln!(fmt, "ladder relation effect over {}", report.generation)?;
        writeln!(
            fmt,
            "rows {}   instances {}   groups {}   participants {} ({:.1}% of rows)",
            report.rows,
            report.edges,
            report.groups,
            report.participants,
            percent(report.participants, report.rows),
        )?;
        writeln!(
            fmt,
            "certificate  max component error {:.3e} under bound {:.0e}: the rebuilt canonical \
             frame reproduces the published column",
            report.certificate.max_absolute_error, report.certificate.tolerance,
        )?;
        writeln!(fmt)?;

        writeln!(
            fmt,
            "step     eta   relation-loss  contraction-mass  contraction-mean  contracted  \
             bystander-move",
        )?;
        for (index, step) in report.steps.iter().enumerate() {
            writeln!(
                fmt,
                "{index:>4}  {:>6.2}  {:>14.3}  {:>+16.5}  {:>+16.5}  {:>9.1}%  {:>14.5}",
                step.condition,
                step.relation_loss,
                step.contraction.mass_weighted_mean,
                step.contraction.unweighted_mean,
                f64::from(step.contraction.contracted_fraction) * 100.0,
                step.non_participant_displacement.mean,
            )?;
        }
        writeln!(fmt)?;

        let canonical = &report.steps[report.canonical_index];
        let argmax = &report.steps[report.contraction_argmax_index];
        writeln!(
            fmt,
            "canonical step {} (eta {:.2}); contraction argmax step {} (eta {:.2}): the published \
             step is{} the argmax of its own measured curve",
            report.canonical_index,
            canonical.condition,
            report.contraction_argmax_index,
            argmax.condition,
            if report.canonical_is_argmax {
                ""
            } else {
                " not"
            },
        )?;
        writeln!(fmt)?;

        writeln!(
            fmt,
            "canonical step groups, ascending by contraction-mass (world units):",
        )?;
        writeln!(
            fmt,
            "relation  instances  strength  proximal  coincident  contraction-mass  \
             contraction-mean  contracted",
        )?;
        let mut groups: Vec<_> = canonical.group_contractions.iter().collect();
        groups.sort_by_key(|group| group.contraction.mass_weighted_mean);
        for group in groups {
            writeln!(
                fmt,
                "{:>8}  {:>9}  {:>8.3}  {:>8.3}  {:>10.3}  {:>+16.5}  {:>+16.5}  {:>9.1}%",
                group.relation,
                group.contraction.edge_count,
                group.strength,
                group.proximal,
                group.coincident,
                group.contraction.mass_weighted_mean,
                group.contraction.unweighted_mean,
                f64::from(group.contraction.contracted_fraction) * 100.0,
            )?;
        }

        write!(fmt, "report      {}", self.output)
    }
}

/// Returns `part` of `whole` in percent.
///
/// An empty whole reads zero.
fn percent(part: usize, whole: usize) -> f64 {
    if whole == 0 {
        return 0.0;
    }
    // Counts sit far below 2⁵³, so the quotient is exact enough for display.
    #[expect(
        clippy::cast_precision_loss,
        reason = "display quotient of small counts"
    )]
    {
        part as f64 / whole as f64 * 100.0
    }
}

impl LadderArgs {
    /// Rebuilds the ladder frames and reads the relation effect.
    ///
    /// The reading serializes as the report bundle at the requested output path.
    ///
    /// # Errors
    ///
    /// Returns a [`ReportError`] when the run cannot write the bundle.
    ///
    /// # Panics
    ///
    /// This panics when the run cannot open the generation or its artifacts, or when the rebuilt
    /// canonical frame does not reproduce the published coordinate column. A report run has no
    /// recovery path, and the error is the diagnosis.
    pub(super) fn run(self) -> Result<LadderVerdict, ReportError> {
        let report =
            LadderReport::compile(&self.root.root, self.generation, self.root.device.resolve());

        let bundle =
            serde_json::to_vec_pretty(&report).expect("the report bundle serializes to JSON");
        std::fs::write(&self.output, bundle).map_err(ReportError::Io)?;

        Ok(LadderVerdict {
            report,
            output: self.output,
        })
    }
}
