# Elicitation Kernel — Product Description

Status: companion document to [spec.md](../../../spec.md)
Written: 2026-08-10

This document tells you what the product does. It uses product terms, not architecture terms.
It obeys the writing rules of ASD-STE100 Simplified Technical English where possible. Some
technical names are necessary. Section 12 gives the list of technical names and connects them
to the terms in the specification.

The specification has the full technical rules. If this document and the specification do not
agree, the specification is correct.

---

## 1. What the product is

The product is a software library for chat agents. A developer puts the library into an agent.
The agent can then do structured interviews with a person.

The agent speaks with the person in a normal chat conversation. In the conversation, the agent
collects facts. The system records each fact together with the words of the person. The result
is a structured document. Examples of such documents: a set of test scenarios, or a safety
argument.

The product has no fixed subject. A **plugin** tells the system what facts to collect, and what
document to make. A developer can write a new plugin for a new subject. The system does not
change when a new plugin comes.

## 2. What an interview is like

The conversation is primary. The person and the agent speak freely. The agent does not follow
a fixed list of questions. The agent does not fill a form field by field.

When the agent needs a precise answer, it can show a **question card** in the chat. A question
card is a small form. There are three basic types:

- A free text question.
- A question with one choice.
- A question with more than one choice.

The agent can also show a **question set**: one card with a list of questions. The person can
answer them one by one, in the chat, without a stop after each answer.

Every question card also appears as simple text. If the chat window cannot show cards, the
person can read the question and type an answer. No function is lost.

The person is always free. The person can:

- Answer the card.
- Type a different answer as normal text.
- Speak about a different subject.
- Come back to the question later, or not at all.

The system records all of these results correctly. An unanswered question is not an error.

## 3. How the system collects facts

The agent does not record facts one by one while the person speaks. The agent waits until a
part of the conversation is complete. Then the system does a **sweep**: it reads that part of
the conversation and records the facts from it.

A sweep is safe to do again. If the system reads the same conversation twice, it does not
record the same fact twice. If the first sweep missed a fact, a second sweep can add it.

## 4. What a recorded fact contains

Each recorded fact is a **capture**. A capture contains:

- The fact itself, in the structure that the plugin defines.
- A quotation: the exact words of the person that show the fact.
- A link to the point in the conversation record where the person said those words. You do not
  search by text to find the source. You follow the link.
- A source label. The label shows how the system got the fact:
  - The person said it directly.
  - The agent found it from context (an inference).
  - The agent is not sure (a tentative reading).
  - The system used a standard value (a default).
  - The system got the value from an external source.

The system obeys these rules at all times:

- Each fact must have a source. A fact without a source is refused.
- Only the words of the person are applicable as evidence. Text that the system adds to the
  conversation is never evidence.
- An inference must never look the same as a direct statement from the person.

## 5. Corrections and conflicts

The person can change a fact at any time, also after the interview seems complete.

When a fact changes, the system makes a new capture. The new capture replaces the old capture.
The system keeps the old capture. The full history of each fact stays available. A correction
never erases information.

If two facts do not agree, the system does not select one of them automatically. It records a
**conflict**. The conflict stays open until the person gives a decision. The system records
the decision together with the words of the person. There is no silent resolution.

## 6. Answers that are not values

Sometimes the person cannot give a value. The system records the type of each such answer.
The types are different, and the system keeps them different:

- The person does not know the value.
- The person did not make the decision yet.
- The question is not applicable.
- The value does not exist. Example: "We have no deadline."
- The person refused to answer.
- The person moved the answer to a later time.

Example of the difference: "We have no deadline" and "I do not know the deadline" are two
different facts. A form that writes an empty field for both loses this difference. This system
does not lose it.

## 7. Documents that continue across conversations

The result of the interviews is a **target document**. The target document stays when a
conversation stops.

- A person can stop a conversation at any point. Nothing is lost.
- Days later, the person can start a new conversation about the same document. The agent then
  gets a short summary of what changed. The person sees a note that this summary was added.
- Different conversations can add facts to one document, one after the other.
- If an old conversation continues after the document changed, the system protects the
  document. A change that does not agree with the current state is refused, with an
  explanation. The person can then decide.

The conversations are also documents. The system keeps each conversation record together with
the target document, in the same store. The conversation records are the source of the facts.
The system does not delete them.

A target document is never locked. "Complete" is a calculated status, not a gate. The person
can always come back with one more correction.

## 8. What you can read from the system

At any time, the system can show:

- The current facts, with their sources and quotations.
- The open conflicts and the open questions.
- The history of each fact.
- The output document that the plugin makes from the facts. Example: the Gherkin text, or the
  assurance argument.
- A loss report. If the output format cannot show a recorded fact, the report says so. The
  system does not drop facts silently.

The output document is always calculated from the facts. The facts are the truth. The output
is a view.

## 9. The first two subjects

The first release contains two plugins.

**Test scenarios (Gherkin).** The agent interviews the person about the behavior of a system.
The output is a set of scenarios in the Gherkin format (Given / When / Then). The plugin makes
sure that the output has correct syntax, and that the steps use the agreed vocabulary.

**Assurance argument.** The agent interviews the person about a claim, for example: "this
system is safe to operate". The output is a structured argument: claims, evidence, and
assumptions, connected in a tree. The primary output is the **assumption ledger**: a table of
all open assumptions, with their owners and their review states. The tool shows which claims
stand on unproven assumptions. The tool finds weak points. It does not certify the system.

More subjects can follow. A plugin for business process models is planned as the third.

## 10. Where the product operates

The first release operates on one chat framework (Flue), on a local machine. The design
prepares for remote operation on a server, but the first release does not include it.

The developer who adds the library to an application writes a small amount of code: the agent
module, the server mount, and the database connection. The library supplies the rest.

## 11. What the product does not do

- It does not send its results to another tool automatically. Persons and tools read the
  target document through the same read functions.
- It does not give scores to questions, and it does not count questions. The agent decides
  what to ask from the conversation, with guidance from the plugin.
- It does not continue without the person. The person is the source of the facts. When
  information is missing, the system records that it is missing. It does not invent values.
- It does not lock a document, and it does not close a conversation.

## 12. Technical names in this document

| Name in this document                      | Name in the specification                          |
| ------------------------------------------ | -------------------------------------------------- |
| the system                                 | the harness                                        |
| question card                              | affordance                                         |
| question set                               | questionnaire                                      |
| capture                                    | capture (with capture envelope)                    |
| sweep                                      | sweep (on settlement)                              |
| source label                               | epistemic status                                   |
| answer that is not a value                 | absence state                                      |
| conflict                                   | `conflicting` issue, closed by a resolution record |
| replaces                                   | supersession                                       |
| target document                            | target-document                                    |
| summary at the start of a new conversation | re-entry briefing                                  |
| loss report                                | typed loss report from `project`                   |
| plugin                                     | plugin (with its packs)                            |
| chat framework                             | substrate                                          |
