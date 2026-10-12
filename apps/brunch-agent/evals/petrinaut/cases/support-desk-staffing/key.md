# Key: support-desk-staffing

For whoever scores a run. The launcher loads only `situation-pack.md` and `opening-message.md`, so the persona never sees this file. Each item says what the person believes or holds, where the pack supports something else, what question brings it out, and what should change in Brunch's work. Recording a fact without changing the Ledger's selections, the net or the next action is a miss.

Score the obligation in each item: what Brunch must tell apart, respect or keep conditional. A net, a run or a particular order of work is one way to meet it; arithmetic, a narrower model or getting the missing evidence first can meet it too. Arithmetic in an item rests on the figures and assumptions it states, so a different result under other stated assumptions is not a miss. The session at the end is one example, not an acceptance condition.

The traps in this case are an incoherent purpose and a misleading measure: a textbook queue whose stated objective and reported number both point the wrong way.

## 1. Lower average wait is the whole objective

- **Belief:** the decision is made on the peak's average wait, within two to eight agents, with cost left out. Under that framing more agents is always better and the answer is trivially eight. Does not survive as stated.
- **Situation:** the morning shift is ten agents; whoever is not on the phones works the email and web-form inbox, which has a two-working-day reply target the customer team reports weekly and chased Priya about last winter. Fewer agents on the phones buys inbox time. Priya takes this for granted and has not said why she would ever choose fewer.
- **Evidence in the pack:** ten on the shift, six on the phones and four on the inbox today; in the March week she ran the peak at five "rather than pull someone off the inbox".
- **What brings it out:** noticing the best setting sits at the bound of the range and asking what fewer agents buys, or what the agents not on the phones are doing.
- **Caught when:** the Ledger carries a second outcome (agent-hours left for the inbox, which is 10 − c agents for two hours, or the inbox target as a declared trade-off) and the comparison reports it beside the phone measures. Choosing a headcount needs criteria she has not given: an acceptable wait, an acceptable hang-up rate, and how strictly the ten-minute promise binds. Brunch asks for them, sets out the trade-off without choosing, or recommends under criteria it states; keeping six for now can be a sound answer.
- **Missed when:** the comparison ranks two to eight on average wait alone and recommends eight; a number is recommended without saying what it costs the inbox; Brunch supplies its own rule for choosing (such as the fewest agents that meet a wait target) as if it were hers; or a throughput rate for the inbox or a cost per agent-hour is invented to close the trade-off.

## 2. The March week shows five was fine

- **Belief:** a week run at five gave a reported average wait of 2.6 minutes, a bit up on the usual two, so the desk managed on five. Does not survive as support for five.
- **Evidence in the pack:** the reported average is over answered calls only, and callers who hang up are counted separately; that week hang-ups rose from two or three in a hundred to about one in twelve, and complaints about not getting through rose.
- **Arithmetic:** callers who give up after eight to ten minutes are exactly the long waits, and they drop out of the answered-call average. A simulation of the two-hour block from an empty queue (Poisson arrivals at 50 an hour, exponential handle time with mean 6 minutes, patience uniform 8–10 minutes) gives, at six agents, an answered-call average of about 1.5 minutes and 2% abandonment; at five, about 2.8 minutes and 7% abandonment. Without hang-ups the all-caller average at five would be about 6.5 minutes against about 2.3 at six. The answered-call average is the measure least moved by going to five; abandonment more than triples, and the wait callers would face without hanging up nearly triples. The simulation's levels sit below the report's (about two minutes at six), so treat the figures as shape, not calibration.
- **What brings it out:** asking how the reported average is calculated, what happens to callers who hang up, or what else changed in the week she ran at five.
- **Caught when:** the measure becomes the wait for all callers (with abandoned callers counted to the point they left) or abandonment is reported beside the answered-call wait; any net lets callers abandon, so a run can show the March pattern; the March week is treated as weak evidence for five, not support.
- **Missed when:** the run reports only the answered-call average; the March week is recorded as support for five; abandonment is recorded as a fact and changes nothing in the net or the measures.

## 3. Six is one too many

- **Belief:** the current six is one more than the peak needs. Not settled by the pack: five runs at the offered load, and whether that is acceptable depends on how many hang-ups and promise breaches she will accept.
- **Arithmetic:** 50 calls an hour at 6 minutes each is 300 agent-minutes of work an hour, 5 Erlangs, so five agents would be busy all the time on average. Without hang-ups that queue has no steady state and grows through the block; with hang-ups it stays bounded, and the cost shows as abandonment and long waits instead (item 2). Either way five has no slack, so small changes in load move its results a lot. For six and more, Erlang C (no hang-ups) with a = 5: Erlang B by recursion B(n) = a·B(n−1)/(n + a·B(n−1)) from B(0) = 1 gives B(1) = 0.8333, B(2) = 0.6757, B(3) = 0.5297, B(4) = 0.3983, B(5) = 0.2849, B(6) = 0.1918. Then C = 6·0.1918/(6 − 5·0.8082) = 1.151/1.959 = 0.588, so 59% of callers wait, with a steady-state mean wait of C·AHT/(c − a) = 0.588·6/1 = 3.5 minutes. Seven agents: B(7) = 0.1205, C = 0.324, mean wait 0.97 minutes. Eight: B(8) = 0.0700, C = 0.167, mean wait 0.33 minutes. A two-hour block starting near empty does better than steady state at six (the simulation's all-caller average is about 2.3 minutes without hang-ups), which fits the reported two minutes.
- **What brings it out:** putting her own rate and handle time side by side, or asking how busy six agents are in the peak.
- **Caught when:** the offered load is stated from her figures and five is recognised as running at capacity; five's waits, hang-ups and ten-minute share are reported under stated assumptions about arrivals and patience; a recommendation of five, if made at all, carries those figures.
- **Missed when:** five is recommended on the strength of the average wait; results at five are reported without saying they sit at capacity; or the growth of a queue without hang-ups is presented as what her desk, where callers hang up, would see.

## 4. Calls arrive at random around 50 an hour

- **Situation:** the team's working assumption, stated as unmeasured; Priya also does not know whether calls bunch inside the two hours beyond "it builds after ten".
- **Caught when:** random arrivals at a flat rate and the six-minute mean handle time are carried as assumptions, not calibration; at least one stated variant (a heavier second hour or a longer handle time) is run or named as an owed check, given that six sits near capacity and small changes in load move the answer.
- **Missed when:** the flat rate is presented as measured; the recommendation is given without saying how sensitive it is to load near five Erlangs.

## Protected condition

The ten-minute promise: no caller waits more than ten minutes. A run reports it beside the result (the share of callers whose wait passes ten minutes, counting those who hang up first, or the longest wait); it is not enforced by the run, and the delivery says so. Under the flat-rate assumptions, expect it to bite at six: steady-state Erlang C without hang-ups gives `P(wait > 10) = C·exp(−(c − a)·10/AHT) = 0.588·exp(−10/6) = 11%`; the block simulation without hang-ups gives about 6% at six, 25% at five, under 1% at seven. With patience of eight to ten minutes most would-be breaches turn into hang-ups, so the export barely shows them. Brunch should say a breach rate today is unknown and how it would be pulled from the export.

## Must stay unknown

- The cost of an agent-hour.
- How much of the inbox an agent clears in a two-hour block.
- How often the ten-minute promise is broken today.
- The arrival pattern inside the block and how patient callers really are; the eight-to-ten minutes is her belief from when calls end, not from why.

## One right-sized session

Ask what the agents not on the phones do before treating eight as the answer; ask how the reported wait is calculated and what the March week showed besides it; state the offered load from her figures; build one queue with abandonment and a headcount parameter; compare two (or a sensible subset) to eight reporting all-caller wait, abandonment, the ten-minute share and agent-hours left for the inbox; deliver the trade-off, with a recommendation only under criteria she gives or Brunch states, the owed checks (arrival pattern, promise breaches from the export, inbox throughput) and no invented cost.
