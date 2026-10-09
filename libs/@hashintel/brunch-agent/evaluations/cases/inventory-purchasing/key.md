# Key: inventory-purchasing

For whoever scores a run. The launcher loads only `situation-pack.md` and `opening-message.md`, so the persona never sees this file. Each item says what the person believes or holds, where the pack supports something else, what question brings it out, and what should change in Brunch's work. Recording a fact without changing the Ledger's selections, the net or the next action is a miss.

The trap in this case is a well-provenanced specification with one unexamined trigger: Elena's account is careful and mostly right, so Brunch has to find the one place where her rule reads something other than what she assumes, and must not distrust the parts that hold.

## 1. The reorder trigger reads usable stock

- **Belief:** stock isn't usable until quality release, and the reorder point protects production. She has not connected the two; she reads the February shortage as a bad Indian lot. Does not survive as she holds it.
- **Evidence in the pack:** the inventory position is unrestricted plus quality-inspection stock plus open purchase orders (SAP's standard MRP availability); the German top-up is a second rule on the same position; in February the report showed about 2,850 Flowbind, of which about 350 was unrestricted and 2,500 a lot in quality inspection; no purchase order or top-up went out until quality rejected that lot.
- **Arithmetic:** 350 + 2,500 = 2,850, above the 1,500 reorder point and the 500 top-up threshold, so neither rule fires. After rejection the position is 350, below both. A forecast-driven batch needs about 662 Flowbind (699 under the static plan); 350 + a 250 top-up = 600 still falls short, so the order waits for the Indian 2,500: about 4 days' hold before rejection, about 13.8 days' lead time, about 4 days' quarantine, roughly 22 days, which matches "about three weeks".
- **What brings it out:** asking her to walk one shortage week; asking what exactly the reorder point (and the "below 500" rule) compares against.
- **Caught when:** the net's reorder and top-up transitions read the position the rule actually reads, quarantine included, while production consumes released stock only; a rejected lot can therefore delay the reorder; the February week is reproduced or kept owed as a case to reproduce; the top-up threshold is pinned to a named stock figure in the Ledger. Brunch may name a trigger on unrestricted plus open orders as an option to compare, beside her two production policies, but not as a recommendation before a run.
- **Missed when:** the trigger reads usable stock, or a single undifferentiated "stock" place; the February week is recorded as a supplier-quality incident and nothing in the net changes; "below 500" stays unpinned.

## 2. The urgent supplier is slower on average

- **Belief:** German Supplier is the urgent source, though its fitted mean lead time (15.1 days) is longer than Indian Supplier's (13.8) and its unit price (EUR 81.73) is lower than Indian's (EUR 109.91). Survives under the right reading: "urgent" means dependable, not fast.
- **Evidence in the pack:** fitted lead times 13.8 ± 3.7 days (Indian) and 15.1 ± 0.9 days (German); German deliveries arrive when expected; top-ups of 250 are what's arranged, and nobody knows whether German would take a 2,500 order.
- **Arithmetic (assuming roughly normal lead times):** 95th percentile Indian 13.8 + 1.645 × 3.7 ≈ 19.9 days, German 15.1 + 1.645 × 0.9 ≈ 16.6 days; 90th percentile about 18.5 and 16.3. The percentiles cross at about the 68th (13.8 + 3.7z = 15.1 + 0.9z gives z ≈ 0.46, about 15.5 days). Ordered on the same day, Indian arrives first about 63% of the time (difference −1.3 ± 3.8 days), but German bounds the bad case about 3 days tighter.
- **What brings it out:** asking why German is "urgent" rather than faster, or why not buy all Flowbind from the cheaper German source.
- **Caught when:** German is modelled by its own lead-time distribution, not as a faster or zero-delay copy of Indian; Brunch reads "urgent" as a tighter tail and can say so with the percentiles; the price gap is recorded with German capacity as an owed question for the supplier, not a basis for a recommendation.
- **Missed when:** German gets a shorter delay than Indian; Brunch tells Elena her "urgent" label is wrong or flags it as a data contradiction; the delivery recommends moving all Flowbind to Germany on price, or invents a capacity limit or contract term to explain why not.

## 3. Forecast-driven production amplifies noise

- **Situation:** her stated belief and the comparison she wants: static plan versus live forecast, or a blend. Survives as a question for the runs, not as a finding.
- **Caught when:** the production-policy share is a parameter the runs vary, and the comparison reports the targets under each, including bad weeks.
- **Missed when:** her belief is reported as confirmed without a comparison, or the comparison runs only on calm demand.

## Targets: reported, not enforced

Fill rate at least 95%, average production delay at most 0.25 weeks per planned unit, expiry at most 5% per material over 104 weeks. A run reports them beside the cost; it does not enforce them, and the delivery says whether each was met and under what assumptions.

## Must stay unknown

- Site 1000's own rejection rate: one remembered rejection gives no rate; the 5% is an industry assumption.
- Whether German Supplier could take bulk orders, and on what terms.
- Real figures for outages, shipment loss, customs delay, recall and production failure.
- The real costs of storage, shortage, disposal, lateness, switching and lost sales.

## A right-sized session

Ask for one bad week before building; pin what the reorder and top-up rules read; build the position-versus-released-stock distinction and reproduce, or keep owed, the February week; model each supplier by its own lead-time distribution; compare the production policies over 104 weeks under stated disruption and rejection assumptions; deliver with the targets reported, the assumptions named, and the owed checks (Site 1000 rejection history, German capacity, cost figures).
