/**
 * A worked-example ledger derived from the support-desk-staffing evaluation
 * case (`libs/@hashintel/brunch-agent/evaluations/cases/support-desk-staffing`):
 * committed records as the system would hold them after several turns, with
 * assigned IDs and turn anchors (user-message IDs).
 */

import type { LedgerState } from "./records.ts";

export const supportDeskLedger: LedgerState = {
  title: "Brightwater support desk — peak staffing",
  turns: [
    {
      id: "msg-01",
      excerpt:
        "I want to decide how many agents to schedule for the weekday morning peak, and I'd like that decision tested rather than argued about.",
    },
    {
      id: "msg-02",
      excerpt:
        "Callers ring one number and wait in one queue, first come first served. Six agents are on the peak block today; eight seats is the cap, two is the floor.",
    },
    {
      id: "msg-03",
      excerpt:
        "I'd say maybe 45 calls an hour at peak? I'd have to check the export.",
    },
    {
      id: "msg-04",
      excerpt:
        "Here's the phone-system export: about 50 calls an hour in the peak, arriving unevenly. Handle time about six minutes, short bill queries under two, complaints past fifteen.",
    },
    {
      id: "msg-05",
      excerpt:
        "The promise is no caller waits more than ten minutes — a hard rule. I think callers start hanging up after eight to ten minutes on hold, but the export shows when they left, not why.",
    },
    {
      id: "msg-06",
      excerpt:
        "Keep cost out of it — I'd rather it stayed out than have a made-up figure in there. The decision is being made on waiting time, two to eight agents.",
    },
  ],
  entities: [
    {
      address: "e1",
      name: "Decide peak staffing",
      kind: "purpose",
      origin: "stated",
      status: "confirmed",
      turn: "msg-01",
    },
    {
      address: "e2",
      name: "Average waiting time",
      kind: "metric",
      origin: "stated",
      status: "confirmed",
      turn: "msg-01",
    },
    {
      address: "e3",
      name: "Keep peak waiting time low",
      kind: "direction",
      origin: "stated",
      status: "confirmed",
      turn: "msg-01",
    },
    {
      address: "e4",
      name: "Agents on the block",
      kind: "lever",
      origin: "stated",
      status: "confirmed",
      turn: "msg-02",
    },
    {
      address: "e5",
      name: "Seat and licence cap",
      kind: "limit",
      origin: "stated",
      status: "confirmed",
      turn: "msg-02",
    },
    {
      address: "e6",
      name: "The ten-minute promise",
      kind: "threshold",
      origin: "stated",
      status: "confirmed",
      turn: "msg-05",
    },
    {
      address: "e7",
      name: "Weekday morning peak",
      kind: "horizon",
      origin: "stated",
      status: "confirmed",
      turn: "msg-02",
    },
    {
      address: "e8",
      name: "Callers",
      kind: "thing",
      origin: "stated",
      status: "confirmed",
      turn: "msg-02",
    },
    {
      address: "e9",
      name: "The queue",
      kind: "location",
      origin: "stated",
      status: "confirmed",
      turn: "msg-02",
    },
    {
      address: "e10",
      name: "Agents on the phones",
      kind: "resource",
      origin: "stated",
      status: "confirmed",
      turn: "msg-02",
    },
    {
      address: "e11",
      name: "Call handling",
      kind: "activity",
      origin: "stated",
      status: "confirmed",
      turn: "msg-04",
    },
    {
      address: "e12",
      name: "Caller abandonment",
      kind: "event",
      origin: "stated",
      status: "tentative",
      turn: "msg-05",
    },
    {
      address: "e13",
      name: "Cost of an agent-hour",
      kind: "metric",
      origin: "stated",
      status: "out-of-scope",
      turn: "msg-06",
    },
  ],
  claims: [
    {
      address: "c1",
      text: "The measure is average waiting time from joining the queue to answer, over the peak window, reported weekly.",
      entities: ["e2", "e7"],
      origin: "stated",
      status: "confirmed",
      turn: "msg-01",
    },
    {
      address: "c2",
      text: "Staffing is a whole number of agents from two to eight; eight seats and licences is the cap, two is the floor the team leads will accept.",
      entities: ["e4", "e5"],
      origin: "stated",
      status: "confirmed",
      turn: "msg-02",
    },
    {
      address: "c3",
      text: "Six agents are on today's weekday morning peak block.",
      entities: ["e10", "e7"],
      origin: "stated",
      status: "confirmed",
      turn: "msg-02",
    },
    {
      address: "c4",
      text: "About 45 calls an hour arrive during the peak.",
      entities: ["e8", "e7"],
      origin: "stated",
      status: "tentative",
      turn: "msg-03",
    },
    {
      address: "c5",
      text: "The phone-system export shows about 50 calls an hour in the peak, arriving unevenly; off-peak is closer to 15.",
      entities: ["e8", "e7"],
      origin: "evidenced",
      status: "confirmed",
      supersedes: ["c4"],
      turn: "msg-04",
    },
    {
      address: "c6",
      text: "Average handle time is about six minutes with plenty of spread: under two minutes for bill queries, past fifteen for complaints.",
      entities: ["e11"],
      origin: "evidenced",
      status: "confirmed",
      turn: "msg-04",
    },
    {
      address: "c7",
      text: "Calls come in at random around the rate and handle times vary around six minutes — the team's working assumption, not something measured.",
      entities: ["e8", "e11"],
      origin: "assumed",
      status: "tentative",
      turn: "msg-04",
    },
    {
      address: "c8",
      text: "No caller waits more than ten minutes — a hard rule, not a preference to trade off.",
      entities: ["e6"],
      origin: "stated",
      status: "confirmed",
      turn: "msg-05",
    },
    {
      address: "c9",
      text: "Callers start hanging up after about eight to ten minutes on hold; the export shows when they left, not why.",
      entities: ["e12", "e9"],
      origin: "stated",
      status: "tentative",
      turn: "msg-05",
    },
    {
      address: "c10",
      text: "Is the current six one agent too many on the peak block?",
      entities: ["e4", "e10"],
      origin: "stated",
      status: "conflicted",
      turn: "msg-01",
    },
    {
      address: "c11",
      text: "Is there a pattern inside the two-hour block beyond \u201cit builds after ten\u201d?",
      entities: ["e7", "e8"],
      origin: "stated",
      status: "open",
      turn: "msg-05",
    },
    {
      address: "c12",
      text: "Cost stays out of the comparison; the decision is made on waiting time within two to eight agents.",
      entities: ["e13"],
      origin: "stated",
      status: "confirmed",
      turn: "msg-06",
    },
  ],
  reflections: [
    {
      address: "r1",
      text: "Modelled the desk as one queue place feeding a handling transition holding six agent tokens; arrivals use a Poisson rate of 50/hr and handle times an exponential six-minute mean, standing in for the export's \u201crandom around the rate\u201d working assumption.",
      netElements: [
        { kind: "place", id: "p-queue" },
        { kind: "transition", id: "t-handle" },
      ],
      claims: ["c5", "c6", "c7"],
      entities: ["e9", "e10"],
      turn: "msg-04",
    },
    {
      address: "r2",
      text: "The ten-minute promise is tracked as a maximum-wait metric, not enforced by the net: a run reports breaches, it cannot prevent them.",
      netElements: [{ kind: "metric", id: "m-max-wait" }],
      claims: ["c8"],
      entities: [],
      turn: "msg-05",
    },
  ],
};
