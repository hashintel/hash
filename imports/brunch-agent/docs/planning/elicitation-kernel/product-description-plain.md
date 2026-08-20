# Elicitation Kernel — Product Description (plain prose edition)

Status: companion document to [spec.md](spec.md); an alternate rendering of
[product-description.md](product-description.md) in plain technical prose rather than
Simplified Technical English.
Written: 2026-08-10

The specification remains the authority. Where this document and the specification disagree,
the specification is correct.

---

## What the product is

The product is a library that developers add to a chat agent. With the library in place, the
agent can run structured interviews: it talks with a person in an ordinary chat conversation,
gathers facts as they come up, and records each fact together with the person's own words. The
result is a structured document — a set of test scenarios, for example, or a safety argument.

The system itself has no fixed subject matter. A plugin defines what kind of facts to look
for, how to check them, and what document to produce from them. Because the plugin carries all
of the subject knowledge, adding a new document type means writing a new plugin, not changing
the system.

## How an interview works

The conversation always comes first. The agent does not walk the person through a form, and it
does not ask questions in the order a schema happens to list its fields. It follows the
conversation, and it asks about what matters when the conversation makes the gap visible.

When the agent needs a precise answer, it can place a question card in the chat: a free-text
prompt, a single choice, a multiple choice, or a set of related questions the person can work
through in one sitting. Every card also renders as plain text, so a chat surface that cannot
display cards still carries the full interview — the person reads the question and types the
answer instead.

The person stays free throughout. They can answer the card, type something else entirely,
change the subject, or leave a question for later. None of this is an error. The system
records what actually happened, because an unanswered question is itself information the
interview should not lose.

## How facts are recorded

The agent does not commit facts to the record mid-sentence. It waits until a stretch of
conversation has settled — a topic has been talked through and the thread has moved on — and
then reads back over that stretch and records the facts it contains. This read-back is safe to
repeat: because each fact is identified by its content and its evidence, reading the same
stretch twice never produces duplicates, and a second pass can pick up anything the first one
missed.

Each recorded fact carries three things: the fact itself, in the structure the plugin defines;
a quotation of the exact words that support it, together with a durable link to the point in
the conversation record where they were said — nobody searches by text to find a source; and a
source label that says how the system came by it — stated directly by the person, inferred from context, held tentatively, filled in
from a default, or fetched from an external source. The distinction matters because a
plausible inference must never be mistaken for something the person actually said.

Three rules hold without exception. A fact without a source is refused. Only the person's own
words count as evidence — text the system adds to the conversation, such as a catch-up summary,
never does. And what the system inferred stays permanently distinguishable from what the
person stated.

## Corrections, conflicts, and non-answers

People change their minds, so the record is built for revision. A correction produces a new
fact that replaces the old one, and the old one is kept — the history of every fact stays
readable, which is what makes a late correction safe rather than destructive.

When two facts contradict each other, the system does not quietly pick a winner. It records a
conflict and leaves it open until the person decides, and it records that decision in the
person's own words. Recency is not authority: the newest statement wins only when the person
says it does.

Not every answer is a value, and the system keeps the different kinds of non-answer apart: the
person does not know; the decision has not been made yet; the question does not apply; the
value genuinely does not exist; the person declined; the person put it off. "We have no
deadline" and "I don't know the deadline" are different facts that should lead the interview
in different directions, so the system never collapses them into one empty field.

## Documents outlast conversations

The product of the interviews is a target document, and it persists independently of any
conversation. A person can stop mid-interview and lose nothing. Days later they can open a new
conversation against the same document, and the agent starts with a short, clearly marked
summary of what changed in the meantime. Several conversations can feed one document in turn.
The conversations themselves are part of the record: each one is kept indefinitely, stored
alongside the document it fed, because it is the provenance that every recorded fact points
back into.

If a dormant conversation resumes after the document has moved on, the system protects the
document: a change built on stale information is refused, with an explanation of what moved,
so the person can decide with current facts in view. The document itself is never locked.
Completeness is a status the system computes from the record, not a gate it enforces — the
person who comes back with one more correction after "done" is a normal case, not an
exception.

## What you can read out

At any point, the system can show the current facts with their sources and quotations, the
open conflicts and questions, the history behind any fact, and the output document the plugin
derives from it all. The facts are the truth; the output document is a view computed from
them. When the output format cannot express something the record holds — a nuance, an
alternative, a qualification — the system says so in a loss report rather than dropping it
silently.

## The first two subjects

The first release ships two plugins. The Gherkin plugin interviews for system behaviour and
produces scenarios in Given/When/Then form, checking that the output parses and that its steps
use the agreed vocabulary. The assurance plugin interviews for an assurance argument — claims
about a system, the evidence behind them, and the assumptions they rest on, connected in a
structured argument. Its primary output is the assumption ledger: a table of every open
assumption, who owns it, its review state, and which claims it undermines. The tool exists to
expose weak points in an argument, not to certify one — it will tell you which claims stand on
unreviewed assumptions, and it will never call a system proven. A plugin for business process
models is planned third.

## Scope and limits

The first release runs on one chat framework, Flue, on a local machine. The design pins the
constraints that remote deployment will impose, so nothing in the first release blocks the
move to a server, but remote operation itself is not included. The developer embedding the
library writes a small amount of glue — the agent module, the server mount, and a database
connection — and the library supplies everything else.

Some boundaries are deliberate. The system does not forward its results to any other tool;
whoever consumes the document, human or machine, reads it through the same functions. It does
not score or budget questions, because judgement about what to ask belongs to the agent
reading the conversation, guided by the plugin. And it does not fill silence with guesses:
when information is missing, the record says so, plainly.
