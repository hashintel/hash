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
    Atlas, ViewCensus, VisibilityProof,
    cache::CacheEntry,
    density::CutOffset,
    grid::Grid,
    schedule::{ScheduleWidthError, ViewSchedule, cut::ScheduleCut},
    visibility::ProofKind,
};

/// A delivery view that does not bind.
///
/// Every variant names an input this process produced rather than a request the caller shaped. A
/// transport answers [`ViewError::Contract`] and [`ViewError::Schedule`] with its internal problem.
/// [`ViewError::Offset`] is the one a caller can act on. Its token sealed an offset under a
/// contract this process no longer serves, and a fresh mint reseals it.
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
    /// An operator proof travelled with a nonzero delivery-cut offset.
    ///
    /// The corpus schedule has one cut per zoom and takes no offset, so an operator view serves at
    /// offset zero. A nonzero value means a mint sealed and declared an offset no route can serve,
    /// and binding refuses it rather than answering corpus bytes under a declared cut nothing
    /// produced.
    Offset(CutOffset),
}

impl fmt::Display for ViewError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Contract => fmt.write_str(
                "the visibility proof and its delivery schedule disagree about the serving \
                 contract",
            ),
            Self::Schedule(error) => error.fmt(fmt),
            Self::Offset(offset) => write!(
                fmt,
                "the operator proof carries the nonzero delivery-cut offset {}, which the corpus \
                 schedule cannot serve",
                offset.get(),
            ),
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
    /// Caller requirement: `census` is [`Atlas::census`] of `proof`, and `schedule` is
    /// [`ViewSchedule::of`] over that same proof. Binding checks only that the proof and the
    /// schedule name the same serving contract. A census resolved from another proof of the same
    /// shape passes that check, so the pairing is the caller's to hold.
    ///
    /// # Errors
    ///
    /// Returns [`ViewError::Contract`] when `proof` and `schedule` pair the wrong variants,
    /// [`ViewError::Offset`] when an operator proof carries a nonzero `k`, and
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
        let cut = match (proof.kind(), schedule) {
            (ProofKind::Corpus, ViewSchedule::Corpus) if k != CutOffset::ZERO => {
                return Err(ViewError::Offset(k));
            }
            (ProofKind::Corpus, ViewSchedule::Corpus) => None,
            (ProofKind::Scope, ViewSchedule::Scope(scope)) => {
                Some(scope.cut(grid, k).map_err(ViewError::Schedule)?)
            }
            (ProofKind::Corpus, ViewSchedule::Scope(_))
            | (ProofKind::Scope, ViewSchedule::Corpus) => {
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
    /// Returns [`ViewError::Offset`] when the entry holds an operator proof and `k` is nonzero, and
    /// [`ViewError::Schedule`] when `k` resolves past the key width. [`ViewError::Contract`] is
    /// unreachable through this constructor, because the entry pairs its own proof with the
    /// schedule built over that proof.
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
            entry.view_schedule(),
            k,
        )
    }

    /// Returns the rows the view may see.
    #[must_use]
    pub(crate) const fn proof(&self) -> &'scope VisibilityProof {
        self.proof
    }

    /// Returns the corpus-wide census of what the proof admits.
    #[must_use]
    pub(crate) const fn census(&self) -> ViewCensus {
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
    pub(crate) const fn is_full(&self) -> bool {
        self.cut.is_none()
    }
}
