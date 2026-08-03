//! The delivery vocabulary of one request.
//!
//! A corpus-bearing response reads a proof, a census, a schedule and a cut offset. The proof states
//! which rows the scope may see. The census states what that view aggregates to over the whole
//! corpus. The schedule states which cascade orders its delivery. The cut offset states where that
//! cascade is read. A scope resolution produces the proof, the census and the schedule once, the
//! presented token seals the cut offset per request, and [`View`] binds them together.
//!
//! Binding holds the pairing laws. A census and a schedule each travel with the proof that produced
//! them, and each [`ViewSchedule`] variant pairs with exactly one proof constructor. One
//! constructor checks every pairing at the request boundary, so assembly receives a view already
//! holding its resolved cut and every assembly rejection is about the request.

use core::{error::Error, fmt};

use super::{
    Atlas, CacheEntry, ViewCensus, VisibilityProof,
    density::CutOffset,
    grid::Grid,
    schedule::{ScheduleCut, ScheduleWidthError, ViewSchedule},
};

/// A delivery view that does not bind.
///
/// Both variants name a server-side defect. This process produced every input a binding reads. A
/// transport answers either variant with its internal problem.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum ViewError {
    /// The proof and the schedule it travelled with pair the wrong variants.
    ///
    /// Each proof constructor pairs with exactly one [`ViewSchedule`] variant, and binding refuses
    /// a mismatched pair rather than serving either contract.
    Contract,
    /// The resolved cut offset lies past the key width.
    ///
    /// A sealed offset resolves against this same generation's schedule, so an out-of-domain value
    /// is a defect to surface. Binding refuses it whole rather than clamping it or substituting
    /// another schedule.
    Schedule(ScheduleWidthError),
}

impl fmt::Display for ViewError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Contract => fmt.write_str(
                "the visibility proof and its delivery schedule disagree about the serving \
                 contract",
            ),
            Self::Schedule(error) => error.fmt(fmt),
        }
    }
}

impl Error for ViewError {}

/// One request's bound delivery view.
///
/// The proof, the census resolved beside it, and the view's schedule read at the request's cut
/// offset. Every assembly path takes this value as its whole statement of visibility, so the
/// endpoints share one delivery vocabulary and one contract check.
///
/// The value borrows the resolution it binds, which a scope holds for its reuse window, so
/// construction costs only per-request arithmetic and repeats no per-scope work.
#[derive(Debug, Copy, Clone)]
pub struct View<'scope> {
    /// The rows the scope may see.
    proof: &'scope VisibilityProof,
    /// The corpus-wide census of what [`Self::proof`] admits, resolved with it.
    census: ViewCensus,
    /// The scope cascade read at the request's offset, absent under an operator proof.
    ///
    /// Absent exactly when the view serves the generation's corpus schedule. Binding established
    /// that equivalence, so the assembly paths read this one discriminant.
    cut: Option<ScheduleCut<'scope>>,
}

impl<'scope> View<'scope> {
    /// Binds one resolved scope's delivery inputs at `k`.
    ///
    /// An operator proof binds the corpus schedule with no cut, and a scoped proof its own cascade
    /// read at `k`.
    ///
    /// # Errors
    ///
    /// Returns [`ViewError::Contract`] when `proof` and `schedule` pair the wrong variants, and
    /// [`ViewError::Schedule`] when `k` resolves past the key width.
    pub(super) fn bind(
        grid: Grid,
        proof: &'scope VisibilityProof,
        census: ViewCensus,
        schedule: &'scope ViewSchedule,
        #[expect(
            clippy::min_ident_chars,
            reason = "`k` is the delivery-cut offset's name throughout the density contract"
        )]
        k: CutOffset,
    ) -> Result<Self, ViewError> {
        let cut = match (proof.is_full(), schedule) {
            (true, ViewSchedule::Corpus) => None,
            (false, ViewSchedule::Scope(scope)) => {
                Some(scope.cut(grid, k).map_err(ViewError::Schedule)?)
            }
            (true, ViewSchedule::Scope(_)) | (false, ViewSchedule::Corpus) => {
                return Err(ViewError::Contract);
            }
        };

        Ok(Self { proof, census, cut })
    }

    /// Binds one held resolution at `k`.
    ///
    /// An entry's census and schedule both derive from that entry's own proof, so the pairing holds
    /// by construction.
    ///
    /// # Errors
    ///
    /// Returns [`ViewError::Schedule`] when `k` resolves past the key width.
    /// [`ViewError::Contract`] is unreachable through this constructor, because the entry pairs its
    /// own proof with the schedule built over that proof.
    pub(crate) fn of(
        atlas: &Atlas,
        entry: &'scope CacheEntry,
        #[expect(
            clippy::min_ident_chars,
            reason = "`k` is the delivery-cut offset's name throughout the density contract"
        )]
        k: CutOffset,
    ) -> Result<Self, ViewError> {
        Self::bind(
            atlas.grid,
            entry.proof(),
            *entry.census(),
            entry.view_schedule(atlas),
            k,
        )
    }

    /// Returns the rows the view may see.
    #[must_use]
    pub const fn proof(&self) -> &'scope VisibilityProof {
        self.proof
    }

    /// Returns the corpus-wide census of what the proof admits.
    #[must_use]
    pub const fn census(&self) -> ViewCensus {
        self.census
    }

    /// Returns the bound scope cut, [`None`] under an operator proof.
    pub(super) const fn cut(&self) -> Option<ScheduleCut<'scope>> {
        self.cut
    }

    /// Returns whether the view serves the generation's corpus schedule.
    ///
    /// True exactly for an operator proof, which is what binding proved when it accepted the pair.
    #[must_use]
    pub const fn is_full(&self) -> bool {
        self.cut.is_none()
    }
}

impl Atlas {
    /// Binds one resolved scope's delivery inputs into the view its responses read.
    ///
    /// Caller requirement: `census` is [`Atlas::census`] of `proof`, and `schedule` is
    /// [`ViewSchedule::of`] over that same proof. Binding checks only that the proof and the
    /// schedule name the same serving contract. A census resolved from another proof of the same
    /// shape passes that check, so the pairing is the caller's to hold. A scope resolves the proof,
    /// the census and the schedule once, and every request under it reads them. `k` is the offset
    /// the request's own token seals.
    ///
    /// # Errors
    ///
    /// Returns [`ViewError::Contract`] when `proof` and `schedule` name different serving
    /// contracts, and [`ViewError::Schedule`] when `k` resolves past the key width.
    #[expect(
        clippy::min_ident_chars,
        reason = "`k` is the delivery-cut offset's name throughout the density contract"
    )]
    pub fn view<'scope>(
        &self,
        proof: &'scope VisibilityProof,
        census: ViewCensus,
        schedule: &'scope ViewSchedule,
        k: CutOffset,
    ) -> Result<View<'scope>, ViewError> {
        View::bind(self.grid, proof, census, schedule, k)
    }
}
