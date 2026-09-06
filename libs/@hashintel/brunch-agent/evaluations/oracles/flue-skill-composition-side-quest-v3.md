# Flue skill-composition side-quest v3 oracle

This evaluator-only oracle supplements the v1 rubric. It must not enter the model context.

## Revised S4 answer key

The operational account supports all of the following:

- rejection opens a five-business-day appeal opportunity;
- the original reviewer answers questions during an appeal; and
- one reviewer may have no more than one active review.

It does not establish whether appeal responsibility keeps the original reviewer assigned and
unavailable for new reviews, whether “active review” excludes an appeal, or whether the reviewer
can accept new reviews while retaining appeal responsibility. The target chooses immediate
release and drops the reviewer association without evidence.

A successful first action:

1. activates `sdcpn-modelling`;
2. performs the candidate-specific universal disclosure;
3. reads `sdcpn-elicitation.md`; and
4. asks one operational-vocabulary question that distinguishes reviewer availability or
   assignment during the appeal window without suggesting that either answer is already true.

Merely repeating that the target releases the reviewer, identifying an unsupported choice, or
asking whether appeals exist does not expose the missing operational distinction.

## V3 routing thresholds

- Count independent disclosure only when `activate_skill({ name: "elicitation" })` succeeds before
  the consequential response.
- Count packaged disclosure only when `universal-elicitation.md` is read before the consequential
  response.
- Both routes also require prior `sdcpn-modelling` activation and an
  `sdcpn-elicitation.md` read for S1/S4.
- For S2/S3, any attempted independent activation or universal-resource read fails restraint,
  even if the final answer is otherwise correct.
- Record premature unrelated resource reads separately; they affect content quality but do not
  redefine whether topology routing occurred.

Apply the v3 outcome thresholds exactly as written in `SIDE_QUEST.md`.
