# \[draft\] Inventory purchasing of raw materials

# Domain Context

The [net](https://drive.google.com/file/d/1IvLNigrr30s5ZzNoBBX4OMWB9fRDFShn/view?usp=drive_link) models raw-material purchasing at Site 1000, a pharmaceutical factory that produces one finished product (Sonic Flow) from 2 raw materials (Sonaflozin and Flowbind). The factory buys from 3 suppliers: 1 for Sonaflozin, 2 for Flowbind. 

Raw materials pass through supplier preparation, transit, quarantine, and quality release before production. Stock loses shelf life throughout this process. The model also covers supplier outages, shipment delays and losses, quality rejection, recalls, production scrap, customer backlog, and spot-order cancellation.

The factory must decide when and how much raw material to purchase. Buying too little can delay production and customer orders; buying too much increases purchase, storage and expiry costs.

Site 1000 is the only recorded producer of Sonic Flow. The model should therefore combine all customer orders from all 5 recorded sites as demand that Site 1000 must supply. Transfers, regional warehouses, and delivery from Site 1000 to the other sites are outside the system boundary.

The evaluation period for policies is 104 weeks. This 2-year period is a modelling assumption chosen to factor in stock expiry and supplier disruptions.

### Dataset

The worked example is based on the synthetic dataset “[small-clean](https://drive.google.com/drive/folders/1YQfqXIfZEu8H2dMILn2OL5mmxwuZutAC?usp=drive_link)” from SAP generator, Site 1000 (Stuttgart, DE), Sonic Flow product only. The following table shows the model name mapping from the data.

| SAP ID | Recorded name in dataset | Name in net |
| :---- | :---- | :---- |
| MAT-A0005 | Sonic Flow (makt) | Sonic Flow |
| MAT-R0006 | "Raw Material MAT-R0006" (generic, makt) | Sonaflozin |
| MAT-R0025 | "Raw Material MAT-R0025" (generic, makt) | Flowbind |
| VEND-0002 | API Supplier 2, China | Chinese Supplier |
| VEND-0016 | Contract Mfg Org 16, India | Indian Supplier |
| VEND-0018 | Biotech CMO 18, Germany | German Supplier |

# Supplementary material

## Model & Data derivation

The model was built using a Python generator script written by an LLM, which builds the Petrinaut JSON file programmatically. 

To ground the model based on the data, LLM writes a small script to read the synthetic SAP tables and fit the model's parameters from them. 

A smoke-test harness runs the net through the Petrinaut engine across all scenarios and several random seeds, checking it compiles, runs to the end, and behaves sensibly (e.g. checks stock counter in the model adds correctly).

| Model variable / rule | PN Implementation | Value | Where it comes from |
| :---- | :---- | :---- | :---- |
| Customer demand mean | Net parameter: demand\_mu | 4.44 orders/week | vbak/vbap (sales orders): 247 Sonic Flow order lines over 55.6 weeks of data |
| Order sizes | Net parameters: small\_share, small\_qty\_mean/sd, bulk\_qty\_mean/sd | 96% small ≈ 53 units4% bulk ≈ 676 units | 247 Sonic Flow order quantities, which fall into 2 clusters; each cluster fitted as a Gaussian |
| Production cadence | Net parameter: plan\_period | 1 order every 1.92 weeks | afko (production orders): 29 orders over 55.6 weeks |
| Batch size | Net parameters: batch\_qty\_mean/sd | 699 ± 200 units | The quantities on 29 production orders |
| Supplier lead times | Transition kernel: Order Sonaflozin, Order/Substitute/Top up Flowbind Material | 28.2 ± 3.3 d (Chinese)13.8 ± 3.7 d (Indian)15.1 ± 0.9 d (German) | ekbe (goods receipts): date ordered vs date received, per supplier |
| Order sizes / rounding | Net parameters: moq\_\[supplier\], round\_\[supplier\], topup\_qty | 2,500-unit bulk orders, 250-unit top-ups | ekpo/ekko (purchase orders, every recorded PO is 2,500 units), eine/marc (minimum order quantities and rounding rules) |
| BOM recipe | Net parameter: bom\_flowbind\_per\_unit, bom\_sonaflozin\_per\_unit | 1 unit of each raw material per unit of Sonic Flow | stpo/stko (bill of materials): component qty ÷ base qty |
| Raw material prices | Transition kernel:  | 89.43 / 109.91 / 81.73 EUR/unit | eina/eine (purchasing info records) |

## Token types

The net uses 9 token types:

* **Stock**: AtVendor, InTransit, DelayedShipments, Quarantine, FinishedGoods, SonaflozinStock, FlowbindStock

  * **material**: which material the stock is (Sonic Flow, Sonaflozin, Flowbind); transitions match on it so transit and manufacturing lines draw the right material.

  * **vendor**: which supplier the stock was ordered from; routes the delivery through that vendor's lead time and prices substitute orders correctly.

  * **qty**: units in the consignment

  * **remaining\_life**: weeks of shelf life left. Counts down by differential equation wherever the stock physically exists; blocks consumption if below 0, raises the firing rate of older stock (the FEFO bias), and triggers the expiry write-off at 0\.

  * **holding\_eur**: storage cost accrued so far. Accrues qty × 0.25 EUR/unit/wk on the factory storage only (SonaflozinStock, FlowbindStock); logged to corresponding counters when the stock is consumed, expires, or is disposed of.

  * **unit\_price**: the EUR price captured from the price index at order placement, so the price is fixed when the order is committed.

  * **dispatch\_clock**: 1-week order preparation countdown at the vendor.

  * **transit\_clock**: Gaussian transit-time countdown, sampled when the order is placed. Together with dispatch\_clock it implements the various suppliers’ lead time distributions.

* **CustomerOrder**: Backlog.

  * **kind**: contract or spot. Contract orders never cancel and incur late penalties; spot orders can walk away.

  * **qty**: units ordered (sampled from data)

  * **waited**: weeks in the backlog (a clock). Drives the spot cancellation hazard and contract tardiness \= max(0, waited − 1 wk), logged when order is fulfilled.

  * **patience**: spot orders only; sampled Gaussian weeks at arrival. The cancellation hazard grows with waited² / patience².

* **ProductionOrder**: ProductionOrdersWaiting.

  * **produce\_qty**: Sonic Flow batch size (sampled from data); sets how much material the batch produces.

  * **consume\_flowbind**: Flowbind quantity to consume, set by BOM recipe in data

  * **consume\_sonaflozin**: Sonaflozin quantity to consume, set by BOM recipe in data

  * **waited**: weeks queued for the line and materials; accrues the production-shortage cost.

* **Job**: InProduction, PlanClock.

  * **remaining**: countdown clock (\~1 week of production in InProduction; 1.92-week scheduling cadence in PlanClock).

  * **qty**: units in the batch, carried through to FinishedGoods on completion.

* **InventoryPosition**: InventoryPositionSonaflozin, InventoryPositionFlowbind.

  * **position**: ledger value: on-hand \+ at-vendor \+ in-transit − committed, excluding quarantine, rejects, and recalls. The purchasing policy orders when it falls below the reorder point.

* **Market**: DemandOutlook.

  * **rate**: the demand rate, feeds the customer-order arrival rates. Drift runs in a differential equation; one of the 2 SDE colours that make the net L4.

  * **diffusion\_clock**: countdown that schedules the noise-sampling kernel every 0.25 weeks (the Euler–Maruyama step).

* **PriceIndex**: RawPriceIndex.

  * **level**: an OU multiplier on all recorded supplier prices (1.0 \= recorded price). Captured onto each Stock token's unit\_price at order placement.

  * **diffusion\_clock**: same Euler–Maruyama noise scheduling as the demand rate; the second SDE colour.

* **Sale**: FulfilledOrders.

  * **kind**: contract or spot, copied from the fulfilled order.

  * **qty**: units sold

  * **lead\_time**: weeks the order waited before fulfilment.

  * **tardiness**: contract lateness beyond the 1-week allowance; priced by the late-delivery penalty metric

* **Record**: LostSales, SwitchFees, LostShipments, ExpiredStock, ScrappedBatches, DelayLog, HoldingCosts, RejectedStock, RecalledStock, DisposalCosts, ShortageCosts.

  * **kind**: what the entry records: expiry (stock went out of date), scrap (a batch failed QC), reject (raw material failed the quarantine check), recall (stock recalled), holding (storage cost), switch (an order was redirected to the backup supplier), shortage (a production order sat waiting), and spot/contract (which kind of customer walked away, on lost-sale entries).

  * **value**: the amount (units or EUR). This is a ledger to preserve data needed after tokens are consumed e.g. holding cost accrued on stock that expires.

## How the model works

### Market & Customer orders

* Customer demand rate fluctuates around an average. The differential equation moves the rate around 4.44 orders per week (see derivation table), while random noise creates busy and quiet periods. Each order is assigned a quantity based on the data: 96% are small orders around 53 units, and 4% are bulk orders around 676 units.

* The model assumes 70% of orders are contract customers (with ongoing supply agreement) and 30% are spot customers who buy when they need stock without a long-term supply agreement. Contract orders remain in the backlog until supplied and incur a penalty when late. Spot orders have an assumed patience period of about 4 weeks; their chance of cancelling increases as they wait. 

### Supplier & raw materials pipeline

* Supplier minimum quantities and order multiples come from SAP data (see derivation table). Orders are rounded because suppliers usually accept specific order multiples, such as full pallets or cases.

* Each supplier's lead time follows the distribution fitted from goods receipts (see derivation table). The model assumes that 1 week of the recorded total delivery time is spent preparing the order at the supplier (and the rest spent in transit).

* Each supplier is either “In Stock” or “Out of Stock”. If the supplier is out of stock, they cannot accept or dispatch orders (shipments that are already in transit are not impacted). When the Indian supplier is unavailable and Flowbind falls below its reorder point, the policy can order from the German supplier instead and records an assumed EUR 5,000 switching fee for extra administration / expediting. A restock event returns suppliers to normal service. The net assumes 2 supplier outages per year, with each outage lasting 2 weeks on average.

* A multiplier (RawPriceIndex) is applied to each supplier’s price to model raw materials price fluctuations. The multiplier’s value changes according to a stochastic differential equation. An index of 1.0 keeps the recorded price, 1.1 makes it 10% higher, and 0.9 makes it 10% lower. The price is fixed on the order when it is placed.

* While an order is in transit, it can arrive normally, be delayed, or be lost. A delayed shipment continues losing shelf life, and enters quarantine after an assumed 6-week average hold. A lost shipment is recorded, and the vendor sends a replacement without charging the factory again. The replacement restarts supplier preparation and transit with a new full shelf life.

* Raw materials arriving at the factory go through quarantine as they are not typically immediately approved for production in pharmaceutical manufacturing. The quarantine confirms the material and supplier, checks quantity, packaging, damage and certificate of analysis before the materials is released for production. The 4-day average quality hold and 5% intended rejection rate are industry-based assumptions ([2026 Pharma KPI benchmarks](https://intuitionlabs.ai/pdfs/2026-pharma-kpi-benchmarks-oee-batch-release-r-d.pdf), [Process Industries Performance study](http://Process-Industries-Study-FinalReport)).

### Production orders and production

* A queued order starts when the production line and enough Sonaflozin and Flowbind are available. Its waiting time is recorded and creates a production-shortage cost. The batch then spends about 1 week in production before finishing or being scrapped after a production failure.

* First Expired, First Out (FEFO) makes stock with less remaining shelf life more likely to be used by the factory. To model this, older stock receives a higher transition firing rate, so the oldest eligible stock is always selected first. 

* The initial stock held at manufacturing and expiry dates are based on SAP data: the net converts the expiry dates into fixed weeks of shelf life remaining when the simulation starts: 88, 140, and 156 weeks remaining for Sonaflozin and 28.5 weeks for Sonic Flow. Flowbind has no batch-expiry data, so a 156-week shelf life is assumed.

* Raw-material prices and the estimated EUR 55.47 profit per Sonic Flow unit come from the SAP data. Storage, missing-stock, disposal, late-delivery, and supplier-switching costs are assumed because the data does not contain them.

### Scenarios & Experiments

A set of scenarios are included in the model to mimic some real world situations: 

| Scenario | Description |
| :---- | :---- |
| Baseline | The baseline scenario derived from data and default assumptions |
| Calm market | Noise terms on customer demand and raw materials price are set to 0 (no fluctuations). |
| Volatile market | Customer demand noise ×3 to model big spikes and droughts |
| Demand surge | Customer demand starts at 3× its mean and falls back.  |
| Volatile prices | Raw materials price noise ×4 to model price volatility |
| Fragile supply | Supplier outages ×5 (out of stock \~29% of the time) |
| Shipments delays | Customs/goods-receipt holds ×10 (\~1 in 3 orders on the slow Chinese-supplier leg). Material ages in the hold and arrives late or expired. |
| Recall wave | A 0.02/week recall hazard on every stored lot. |
| Depleted start | No stock stored at the factories to start with. |
| Optimisation | Same as baseline scenario with the 6 purchasing-policy parameters plus the production forecast weight exposed for experiments |

Some potentially interesting experiments may be:

* **Market impact:** run the baseline, calm market and volatile market scenarios and compare Policy cost (EUR), Fill rate, Holding costs (EUR) and Late-delivery penalties (EUR) to investigate the impact of market volatility.

* **Tuning production policy:** run the optimisation scenario and set production forecast weight to 0 and 1, and compare with Volatile market to see the impact of dynamic vs static forecasts (observe Policy cost (EUR), Fill rate, Production orders waiting, Late-delivery penalties (EUR), Expired stock written off).

* **Stock buffer**: run the fragile supply scenario with different levels of stock buffer (rop, target parameters for Sonaflozin and flowbind) and see the effects on switching suppliers (Supplier switches \+ Switching fees (EUR)), Late-delivery penalties (EUR), Policy cost (EUR), Fill rate and Holding costs (EUR) for storing stock. 

## Place & Transition Summary tables

| Transition | Kind | Domain area |
| :---- | :---- | :---- |
| Shift the demand rate (diffusion step) | Deterministic (clock) | Market & customer orders |
| Shift the price index (diffusion step) | Deterministic (clock) | Market & customer orders |
| Receive a contract / spot order (small / bulk) | Stochastic | Market & customer orders |
| Cancel a spot order (patience hazard) | Stochastic (guarded) | Market & customer orders |
| Fulfil an order | Stochastic (guarded) | Market & customer orders |
| Order Sonaflozin (reorder-point policy) | Stochastic (guarded) | Purchasing policy |
| Order Flowbind Material (reorder-point policy) | Stochastic (guarded) | Purchasing policy |
| Top up Flowbind Material (urgency threshold) | Stochastic (guarded) | Purchasing policy |
| Substitute order Flowbind Material | Stochastic (guarded) | Purchasing policy |
| Run out of stock / Restock (3 pairs) | Stochastic | Suppliers & inbound logistics |
| Ship an order (3 suppliers) | Deterministic (clock) | Suppliers & inbound logistics |
| Goods receipt into quarantine (3 suppliers) | Deterministic (clock) | Suppliers & inbound logistics |
| Lose a shipment (vendor reships) | Stochastic | Suppliers & inbound logistics |
| Delay a shipment (customs / GR hold) | Stochastic | Suppliers & inbound logistics |
| Release a held shipment | Stochastic | Suppliers & inbound logistics |
| Quality release (2 materials) | Stochastic | Quality control |
| QC rejection | Stochastic | Quality control |
| Scheduled production order (forecast-weighted plan) | Deterministic (clock) | Production |
| Start a scheduled batch | Stochastic (guarded) | Production |
| Complete a batch | Deterministic (clock) | Production |
| Scrap a batch (QC failure) | Stochastic | Production |
| Consolidate part-used stock (2 materials) | Stochastic (guarded) | Warehouse & expiry |
| Discard emptied stock (3 stock places) | Deterministic (predicate) | Warehouse & expiry |
| Write off expired stock (3 stock places) | Deterministic (predicate) | Warehouse & expiry |
| Recall a lot / batch (3 stock places) | Stochastic (guarded) | Recalls |

| Place | Token type | Dynamics | Domain area |
| :---- | :---- | :---- | :---- |
| DemandOutlook | Market | Demand rate: OU drift \+ diffusion clock | Market & customer orders |
| Backlog | CustomerOrder | Clock: customer order ageing | Market & customer orders |
| LostSales | Record | — | Market & customer orders |
| FulfilledOrders | Sale | — | Market & customer orders |
| RawPriceIndex | PriceIndex | Price index: OU drift \+ diffusion clock | Market & customer orders |
| InventoryPosition\_Sonaflozin | InventoryPosition | — | Purchasing policy |
| InventoryPosition\_FlowbindMaterial | InventoryPosition | — | Purchasing policy |
| OrdersPlaced | Stock | — | Purchasing policy |
| ChineseSupplier / IndianSupplier / GermanSupplier | (plain) | — | Suppliers & inbound logistics |
| InStock\_\* / OutOfStock\_\* (3 pairs) | (plain) | — | Suppliers & inbound logistics |
| AtVendor | Stock | Order book: shelf life \+ dispatch clock | Suppliers & inbound logistics |
| InTransit | Stock | Transit: shelf life \+ transit clock | Suppliers & inbound logistics |
| DelayedShipments | Stock | Clock: shelf-life countdown (no storage charge) | Suppliers & inbound logistics |
| DelayLog | Record | — | Suppliers & inbound logistics |
| LostShipments | Record | — | Suppliers & inbound logistics |
| SwitchFees | Record | — | Suppliers & inbound logistics |
| Quarantine | Stock | Shelf-life countdown \+ storage-cost accrual | Quality control |
| RejectedStock | Record | — | Quality control |
| ProductionOrdersWaiting | ProductionOrder | Scheduled batch: waiting clock | Production |
| PlanClock | Job | Clock: production countdown | Production |
| ProductionLineFree | (plain) | — | Production |
| InProduction | Job | Clock: production countdown | Production |
| ScrappedBatches | Record | — | Production |
| SonaflozinStock | Stock | Shelf-life countdown \+ storage-cost accrual | Warehouse & expiry |
| FlowbindMaterialStock | Stock | Shelf-life countdown \+ storage-cost accrual | Warehouse & expiry |
| FinishedGoods | Stock | Shelf-life countdown \+ storage-cost accrual | Warehouse & expiry |
| ExpiredStock | Record | — | Warehouse & expiry |
| RecalledStock | Record | — | Recalls |
| HoldingCosts | Record | — | Cost ledgers |
| DisposalCosts | Record | — | Cost ledgers |
| ShortageCosts | Record | — | Cost ledgers |

# 

