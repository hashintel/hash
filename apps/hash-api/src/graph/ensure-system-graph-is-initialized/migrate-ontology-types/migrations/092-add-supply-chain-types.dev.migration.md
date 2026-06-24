# Supply Chain Ontology Notes

## Entity to SAP Table Mapping

| Ontology entity                | Main SAP analogue                                                 | Why it exists                                                                        |
| ------------------------------ | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `Company`                      | Shared abstraction over partner master data                       | Common parent for customers and vendors.                                             |
| `Customer`                     | `KNA1`                                                            | Captures customer / ship-to identifiers, names, and geography.                       |
| `Vendor`                       | `LFA1`                                                            | SAP ECC/S/4 source terminology for suppliers in procurement.                         |
| `Material`                     | `MARA`, `MAKT`                                                    | Cross-site material master and description.                                          |
| `Site`                         | `T001W` plus selected org fields from sales/procurement documents | Represents plants, warehouses, and distribution hubs.                                |
| `Site Material Data`           | `MARC`                                                            | Site/plant-specific planning parameters for a material.                              |
| `Material Valuation`           | `MBEW`, plus Kinaxis sourcing cost where available                | Site/valuation-area material pricing and valuation data.                             |
| `Batch`                        | `MSEG.CHARG`, `LIPS.CHARG`                                        | Lot/batch identity used to trace material through movements and deliveries.          |
| `Bill of Materials`            | `MAST`, `STKO`                                                    | BOM header, material assignment, alternative, status, and validity.                  |
| `Bill of Materials Item`       | `STPO`                                                            | Component lines and quantities within a BOM.                                         |
| `Sales Order`                  | `VBAK`                                                            | Customer-facing order header.                                                        |
| `Sales Order Item`             | `VBAP`                                                            | Customer-facing order line.                                                          |
| `Delivery`                     | `LIKP`                                                            | Delivery header for logistics execution.                                             |
| `Delivery Item`                | `LIPS`                                                            | Delivery line item, including material, batch, and preceding sales order references. |
| `Purchase Order`               | `EKKO`                                                            | Purchasing document header.                                                          |
| `Purchase Order Item`          | `EKPO`                                                            | Purchasing document line for a material/site.                                        |
| `Purchase Order Schedule Line` | `EKET`                                                            | Supplier-promised or scheduled delivery lines for PO items.                          |
| `Production Order`             | `AFKO`                                                            | Production order header and scheduling information.                                  |
| `Production Order Item`        | `AFPO`                                                            | Produced material, plant, order quantity, and GR quantity.                           |
| `Material Reservation`         | `RESB`                                                            | Planned component requirements for production orders.                                |
| `Material Movement`            | `MSEG` joined to `MKPF`, or `MATDOC` in S/4HANA                   | Goods movements, receipts, issues, transfers, QA releases, and reversals.            |
| `Shipment`                     | `VTTK`                                                            | Transport/shipment header with departure and arrival dates.                          |
| `Shipment Item`                | `VTTP`                                                            | Shipment-to-delivery assignment.                                                     |

Deferred SAP analogues:

- `MARD` / `MCHB`: current stock and batch stock snapshots. These should become
  `Stock Position` or `Batch Stock Position` if current inventory snapshots are
  loaded as first-class entities.
- `VBFA`: document flow. The current ontology has `References Document` as a
  generic fallback. A dedicated `Document Flow` entity/link may be useful if
  document-flow rows are loaded directly.
- `QALS` / `QAVE`: quality inspection and usage decisions. These remain out of
  scope because source coverage is patchy.

Batch semantics:

- `Batch` is modeled as lot identity, not a current inventory balance or
  location snapshot.
- `Batch Number` is the identifying label for the batch; a separate generic
  `Identifier` is not needed on this entity.
- Batch usage is expressed through event/document links: `Material Movement`
  records a batch, `Delivery Item` delivers a batch, and `Production Order`
  yields a batch.
- Batch location and stock-on-hand should be derived from `Material Movement`
  postings. If current stock snapshots are later loaded from `MARD`, `MCHB`, or
  equivalent sources, they should be modeled as `Stock Position` /
  `Batch Stock Position` entities linked to `Batch`, `Material`, and `Site`.

## Field Mapping by Entity

The table below maps the ontology fields added or renamed in the migration to
the SAP fields they are expected to carry. `Identifier` remains a generic source
record identifier when a type-specific identifier is not enough.

### Partner and Site

| Ontology field                            | Entity                             | SAP field(s)                                                                                      |
| ----------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------- |
| `Name`                                    | `Customer`, `Vendor` via `Company` | `KNA1.NAME1`, `LFA1.NAME1`                                                                        |
| `Customer Number`                         | `Customer`                         | `KNA1.KUNNR`, also `VBAK.KUNNR`, `LIKP.KUNNR`, `MSEG.KUNNR` as source references                  |
| `Vendor Number`                           | `Vendor`                           | `LFA1.LIFNR`, also `EKKO.LIFNR`, `MSEG.LIFNR` as source references                                |
| `Site Code`                               | `Site`                             | `T001W.WERKS`, `MARC.WERKS`, `MSEG.WERKS`, `VBAP.WERKS`, `LIPS.WERKS`, `EKPO.WERKS`, `AFPO.DWERK` |
| `Site Type`                               | `Site`                             | Derived or configured classification, not a single SAP field                                      |
| `Shipping Point`                          | `Site`, `Delivery`                 | `LIKP.VSTEL`                                                                                      |
| `Purchasing Organization`                 | `Site`, `Purchase Order`           | `EKKO.EKORG`                                                                                      |
| `Sales Organization`                      | `Site`, `Sales Order`              | `VBAK.VKORG`                                                                                      |
| `City`                                    | `Site`, `Customer`                 | `T001W.ORT01`, `KNA1.ORT01`                                                                       |
| `Country`                                 | `Site`, `Customer`                 | `T001W.LAND1`, `KNA1.LAND1`                                                                       |
| `Region`, `Postal Code`, `Street Address` | `Customer`, `Site` where available | Customer/site address fields, e.g. `KNA1` address columns                                         |
| `Storage Location`                        | `Site`, movements as text context  | `MSEG.LGORT`, `LIPS.LGORT`, `MARD.LGORT`, `MCHB.LGORT`                                            |
| `Storage Bin`                             | `Site`                             | Warehouse/bin data if loaded; not used by the current extract                                     |

### Material, Site Material Data, and Valuation

| Ontology field                             | Entity                           | SAP field(s)                                                                                                   |
| ------------------------------------------ | -------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `Material Number`                          | `Material`                       | `MARA.MATNR`, `MAKT.MATNR`, `MARC.MATNR`, `MSEG.MATNR`, `EKPO.MATNR`, `VBAP.MATNR`, `LIPS.MATNR`, `AFPO.MATNR` |
| `Name` / `Description`                     | `Material`                       | `MAKT.MAKTX` filtered by `MAKT.SPRAS`                                                                          |
| `Material Type`                            | `Material`                       | `MARA.MTART`                                                                                                   |
| `Material Group`                           | `Material`                       | `MARA.MATKL`                                                                                                   |
| `Base Unit of Measure` / `Unit of Measure` | `Material`, many line types      | `MARA.MEINS`, `MSEG.MEINS`, `EKPO.MEINS`, `STPO.MEINS`, `RESB.MEINS`                                           |
| `Procurement Type`                         | `Material`, `Site Material Data` | `MARC.BESKZ`                                                                                                   |
| `MRP Type`                                 | `Site Material Data`             | `MARC.DISMM`                                                                                                   |
| `MRP Controller`                           | `Material`, `Site Material Data` | `MARC.DISPO`                                                                                                   |
| `Planning Method`                          | `Site Material Data`             | Usually `MARC.DISMM`; may also include local planning method labels                                            |
| `Safety Stock`                             | `Site Material Data`             | `MARC.EISBE` if available                                                                                      |
| `Reorder Point`                            | `Site Material Data`             | `MARC.MINBE` if available                                                                                      |
| `Minimum Lot Size`                         | `Site Material Data`             | `MARC.BSTMI`                                                                                                   |
| `Maximum Lot Size`                         | `Site Material Data`             | `MARC.BSTMA`                                                                                                   |
| `Fixed Lot Size`                           | `Site Material Data`             | `MARC.BSTFE`                                                                                                   |
| `Rounding Value`                           | `Site Material Data`             | `MARC.BSTRF`                                                                                                   |
| `Planned Delivery Time`                    | `Site Material Data`             | `MARC.PLIFZ`                                                                                                   |
| `Goods Receipt Processing Time`            | `Site Material Data`             | `MARC.WEBAZ`                                                                                                   |
| `In-House Production Time`                 | `Site Material Data`             | `MARC.DZEIT`                                                                                                   |
| `Valuation Area`                           | `Material Valuation`             | `MBEW.BWKEY`                                                                                                   |
| `Valuation Type`                           | `Material Valuation`             | `MBEW.BWTAR` if split valuation is available                                                                   |
| `Valuation Class`                          | `Material Valuation`             | `MBEW.BKLAS`                                                                                                   |
| `Valuation Category`                       | `Material Valuation`             | `MARA.BWTTY` or related split-valuation configuration if loaded                                                |
| `Price Control Indicator`                  | `Material Valuation`             | `MBEW.VPRSV`                                                                                                   |
| `Standard Price`                           | `Material Valuation`             | `MBEW.STPRS` or Kinaxis `sourcing_cost_details.Standard_Cost` where that is preferred                          |
| `Moving Average Price`                     | `Material Valuation`             | `MBEW.VERPR`                                                                                                   |
| `Price Unit`                               | `Material Valuation`             | `MBEW.PEINH`                                                                                                   |
| `Stock Value`                              | `Material Valuation`             | `MBEW.SALK3` if loaded                                                                                         |
| `Valuated Stock Quantity`                  | `Material Valuation`             | `MBEW.LBKUM` if loaded; valuation stock, not a batch/site stock-position snapshot                              |
| `Future Price`                             | `Material Valuation`             | `MBEW.ZKPRS` / future price fields if loaded                                                                   |
| `Future Price Date`                        | `Material Valuation`             | `MBEW.ZKDAT` or equivalent future-price validity date                                                          |
| `Posting Period`, `Fiscal Year`            | `Material Valuation`             | Period/year fields from valuation history if loaded                                                            |

### Purchasing

| Ontology field                      | Entity                                          | SAP field(s)                                                                    |
| ----------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------- |
| `Purchase Order Number`             | `Purchase Order`, `Material Movement`           | `EKKO.EBELN`, `EKPO.EBELN`, `EKET.EBELN`, `MSEG.EBELN`                          |
| `Purchasing Document Type`          | `Purchase Order`                                | `EKKO.BSART`                                                                    |
| `Purchasing Organization`           | `Purchase Order`                                | `EKKO.EKORG`                                                                    |
| `Purchasing Group`                  | `Purchase Order`                                | `EKKO.EKGRP`                                                                    |
| `Document Date` / `Order Date`      | `Purchase Order`                                | `EKKO.BEDAT`                                                                    |
| `Currency Code`                     | `Purchase Order`, valuation and sales documents | `EKKO.WAERS` if available; valuation currency may be inferred by valuation area |
| `Purchase Order Item Number`        | `Purchase Order Item`, `Material Movement`      | `EKPO.EBELP`, `EKET.EBELP`, `MSEG.EBELP`                                        |
| `Order Quantity`                    | `Purchase Order Item`                           | `EKPO.MENGE`                                                                    |
| `Unit of Measure`                   | `Purchase Order Item`                           | `EKPO.MEINS`                                                                    |
| `Net Value`                         | `Purchase Order Item`                           | `EKPO.NETWR` if loaded                                                          |
| `Schedule Line Number`              | `Purchase Order Schedule Line`                  | `EKET.ETENR`                                                                    |
| `Scheduled Delivery Date`           | `Purchase Order Schedule Line`                  | `EKET.EINDT`                                                                    |
| `Statistics-Relevant Delivery Date` | `Purchase Order Schedule Line`                  | `EKET.SLFDT`                                                                    |
| `Scheduled Quantity`                | `Purchase Order Schedule Line`                  | `EKET.MENGE`                                                                    |
| `Goods Receipt Quantity`            | `Purchase Order Schedule Line`                  | `EKET.WEMNG`                                                                    |

### Sales, Delivery, and Shipment

| Ontology field                    | Entity                                           | SAP field(s)                                                            |
| --------------------------------- | ------------------------------------------------ | ----------------------------------------------------------------------- |
| `Sales Document Type`             | `Sales Order`                                    | `VBAK.AUART`                                                            |
| `Sales Organization`              | `Sales Order`                                    | `VBAK.VKORG`                                                            |
| `Distribution Channel`            | `Sales Order`                                    | `VBAK.VTWEG`                                                            |
| `Division`                        | `Sales Order`, `Material`                        | `VBAK.SPART`, material/product division if loaded                       |
| `Order Date`                      | `Sales Order`                                    | `VBAK.ERDAT`                                                            |
| `Document Date`                   | `Sales Order`                                    | `VBAK.AUDAT`                                                            |
| `Requested Delivery Date`         | `Sales Order`                                    | `VBAK.VDATU`; item-level `VBAP.EDATU` if available                      |
| `Customer Reference`              | `Sales Order`                                    | Customer PO/reference fields such as `VBAK.BSTNK` if loaded             |
| `Delivery Number`                 | `Delivery`, `Material Movement`, `Shipment Item` | `LIKP.VBELN`, `LIPS.VBELN`, `VTTP.VBELN`                                |
| `Delivery Type`                   | `Delivery`                                       | `LIKP.LFART`                                                            |
| `Route`                           | `Delivery`, `Shipment`                           | `LIKP.ROUTE`, `VTTK` route fields if loaded                             |
| `Shipping Point`                  | `Delivery`                                       | `LIKP.VSTEL`                                                            |
| `Incoterms`                       | `Delivery`                                       | `LIKP.INCO1`, `LIKP.INCO2`                                              |
| `Scheduled Delivery Date`         | `Delivery`                                       | `LIKP.LFDAT`                                                            |
| `Planned Goods Issue Date`        | `Delivery`                                       | `LIKP.WADAT`                                                            |
| `Actual Goods Issue Date`         | `Delivery`                                       | `LIKP.WADAT_IST`                                                        |
| `Picking Date`                    | `Delivery`                                       | `LIKP.KODAT`                                                            |
| `Delivery Item Number`            | `Delivery Item`, `Material Movement`             | `LIPS.POSNR`, `MSEG` delivery-item reference where available            |
| `Delivered Quantity`              | `Delivery Item`                                  | `LIPS.LFIMG`                                                            |
| `Batch Number`                    | `Delivery Item`                                  | `LIPS.CHARG`                                                            |
| `Shipment Number`                 | `Shipment`                                       | `VTTK.TKNUM`, `VTTP.TKNUM`                                              |
| `Actual Departure Date`           | `Shipment`                                       | `VTTK.DTABF`                                                            |
| `Planned Arrival Date`            | `Shipment`                                       | `VTTK.DPTEN`                                                            |
| `Actual Arrival Date`             | `Shipment`                                       | `VTTK.DATEN`                                                            |
| `Actual Shipment Completion Date` | `Shipment`                                       | Completion date fields in `VTTK`, where present                         |
| `Actual Shipment End Date`        | `Shipment`                                       | End date fields in `VTTK`, where present                                |
| `Planned Shipment End Date`       | `Shipment`                                       | Planned end date fields in `VTTK`, where present                        |
| `Leg Indicator`                   | `Shipment`                                       | Shipment leg indicator fields in `VTTK` / route-leg data, where present |

### Production, BOM, Reservations, and Movements

| Ontology field                                         | Entity                                                          | SAP field(s)                                                                              |
| ------------------------------------------------------ | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `Production Order Number`                              | `Production Order`, `Material Reservation`, `Material Movement` | `AFKO.AUFNR`, `AFPO.AUFNR`, `RESB.AUFNR`, `MSEG.AUFNR`                                    |
| `Production Order Type`                                | `Production Order`                                              | `AFKO.AUART` if loaded                                                                    |
| `Release Date`                                         | `Production Order`                                              | `AFKO.FTRMI`                                                                              |
| `Scheduled Start Date`                                 | `Production Order`                                              | `AFKO.GSTRS`; planned start `AFKO.GSTRP` if available                                     |
| `Scheduled Finish Date`                                | `Production Order`                                              | `AFKO.GLTRS`; planned finish `AFKO.GLTRP` if available                                    |
| `Actual Start Date`                                    | `Production Order`                                              | `AFKO.GSTRI`                                                                              |
| `Actual Finish Date`                                   | `Production Order`                                              | `AFKO.GETRI`                                                                              |
| `Alternative BOM`                                      | `Production Order`, `Bill of Materials`                         | `AFKO.STLAL`, `STKO.STLAL`, `MAST.STLAL`                                                  |
| `Production Quantity`                                  | `Production Order Item`                                         | `AFPO.PSMNG`                                                                              |
| `Goods Receipt Quantity`                               | `Production Order Item`                                         | `AFPO.WEMNG`                                                                              |
| `BOM Number`                                           | `Bill of Materials`                                             | `STKO.STLNR`, `MAST.STLNR`                                                                |
| `BOM Category`                                         | `Bill of Materials`                                             | `STKO.STLTY`, `STPO.STLTY`                                                                |
| `BOM Status`                                           | `Bill of Materials`                                             | `STKO.STLST`                                                                              |
| `Valid From Date`                                      | `Bill of Materials`, `Bill of Materials Item`                   | `STKO.DATUV`, `STPO.DATUV`                                                                |
| `Deletion Indicator`                                   | `Bill of Materials`, `Bill of Materials Item`                   | `STKO.LKENZ`, `STPO.LKENZ`                                                                |
| `Base Quantity`                                        | `Bill of Materials`                                             | `STKO.BMENG`                                                                              |
| `Unit of Measure`                                      | `Bill of Materials`                                             | `STKO.BMEIN`                                                                              |
| `Creation Date`                                        | `Bill of Materials`                                             | `STKO.ANDAT`                                                                              |
| `Last Change Date`                                     | `Bill of Materials`                                             | `STKO.AEDAT`                                                                              |
| `Item Number`                                          | `Bill of Materials Item`                                        | `STPO.POSNR`                                                                              |
| `Component Quantity`                                   | `Bill of Materials Item`                                        | `STPO.MENGE`                                                                              |
| `Item Category`                                        | `Bill of Materials Item`                                        | `STPO.POSTP`                                                                              |
| `Scrap Percentage`                                     | `Bill of Materials Item`                                        | `STPO.AUSCH`                                                                              |
| `Fixed Quantity Indicator`                             | `Bill of Materials Item`                                        | `STPO.FMENG`                                                                              |
| `Requirement Quantity`                                 | `Material Reservation`                                          | `RESB.BDMNG`                                                                              |
| `Withdrawn Quantity`                                   | `Material Reservation`                                          | `RESB.ENMNG`                                                                              |
| `Component Quantity`                                   | `Material Reservation`                                          | `RESB.BDMNG` when used as component planned quantity                                      |
| `Material Document Number`                             | `Material Movement`                                             | `MSEG.MBLNR`, `MKPF.MBLNR`                                                                |
| `Fiscal Year`                                          | `Material Movement`                                             | `MSEG.MJAHR`, `MKPF.MJAHR`                                                                |
| `Material Document Item`                               | `Material Movement`                                             | `MSEG.ZEILE`                                                                              |
| `Movement Type`                                        | `Material Movement`                                             | `MSEG.BWART`                                                                              |
| `Movement Category`                                    | `Material Movement`                                             | Derived grouping from `MSEG.BWART`, e.g. goods receipt, goods issue, transfer, QA release |
| `Posting Date`                                         | `Material Movement`                                             | `MKPF.BUDAT`                                                                              |
| `Document Date`                                        | `Material Movement`                                             | `MKPF.BLDAT` if loaded                                                                    |
| `Reference Number`                                     | `Material Movement`                                             | `MKPF.XBLNR` or source-specific external reference if loaded                              |
| `Movement Quantity`                                    | `Material Movement`                                             | `MSEG.MENGE`                                                                              |
| `Debit/Credit Indicator`                               | `Material Movement`                                             | `MSEG.SHKZG`                                                                              |
| `Stock Type`                                           | `Material Movement`                                             | `MSEG.INSMK`                                                                              |
| `Batch Number`                                         | `Material Movement`                                             | `MSEG.CHARG`                                                                              |
| `Purchase Order Number` / `Purchase Order Item Number` | `Material Movement`                                             | `MSEG.EBELN`, `MSEG.EBELP`                                                                |
| `Delivery Number` / `Delivery Item Number`             | `Material Movement`                                             | Delivery reference fields in `MSEG` where available, or `LIPS` join context               |
| `Customer Number` / `Vendor Number`                    | `Material Movement`                                             | `MSEG.KUNNR`, `MSEG.LIFNR`                                                                |

## Link Mapping and Join Keys

| Link type             | Source -> destination                                                                                | SAP join or derivation                                                                                                                                                                                                                                                                                                     |
| --------------------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Has Customer`        | `Sales Order` / `Delivery` -> `Customer`                                                             | `VBAK.KUNNR = KNA1.KUNNR`; `LIKP.KUNNR = KNA1.KUNNR`.                                                                                                                                                                                                                                                                      |
| `Has Vendor`          | `Purchase Order` -> `Vendor`                                                                         | `EKKO.LIFNR = LFA1.LIFNR`.                                                                                                                                                                                                                                                                                                 |
| `Has Line Item`       | Header -> item entities                                                                              | `VBAK.VBELN = VBAP.VBELN`; `LIKP.VBELN = LIPS.VBELN`; `EKKO.EBELN = EKPO.EBELN`; `EKPO.(EBELN, EBELP) = EKET.(EBELN, EBELP)`; `AFKO.AUFNR = AFPO.AUFNR`; `VTTK.TKNUM = VTTP.TKNUM`; `STKO.STLNR/STLAL = STPO.STLNR/STLAL` through `MAST`.                                                                                  |
| `Has Material`        | Line/item/master data -> `Material`                                                                  | Match normalized material numbers: `MATNR`, `IDNRK`, or component material fields after trimming and removing leading zeroes where needed.                                                                                                                                                                                 |
| `Located At`          | Material/site data, orders, items, and movements -> `Site`                                           | Plant/site fields such as `MARC.WERKS`, `MSEG.WERKS`, `EKPO.WERKS`, `VBAP.WERKS`, `LIPS.WERKS`, `AFPO.DWERK`, `T001W.WERKS`. `Batch` does not use this link because current or historical location is derived from movement events or future stock-position snapshots.                                                     |
| `Of Material`         | `Batch` -> `Material`                                                                                | Batch rows are material-specific: `MSEG.(MATNR, CHARG)` or `MCHB.(MATNR, CHARG)`.                                                                                                                                                                                                                                          |
| `Records Batch`       | `Material Movement` -> `Batch`                                                                       | `MSEG.CHARG` plus normalized `MSEG.MATNR`; include plant/storage location when needed to disambiguate stock position.                                                                                                                                                                                                      |
| `Delivers Batch`      | `Delivery Item` -> `Batch`                                                                           | `LIPS.CHARG` plus normalized `LIPS.MATNR`.                                                                                                                                                                                                                                                                                 |
| `Produces`            | `Production Order Item` -> `Material`                                                                | `AFPO.MATNR = Material.Material Number`.                                                                                                                                                                                                                                                                                   |
| `Yields Batch`        | `Production Order` -> `Batch`                                                                        | Production receipt `MSEG.BWART = 101` with `MSEG.AUFNR` matching `AFKO.AUFNR`; batch from `MSEG.CHARG`.                                                                                                                                                                                                                    |
| `Consumes`            | `Material Reservation` -> `Material`                                                                 | `RESB.MATNR` / component material maps to `Material`. Actual consumption uses `MSEG.BWART IN (261, 262)`.                                                                                                                                                                                                                  |
| `Procures`            | `Purchase Order Item` -> `Material`                                                                  | `EKPO.MATNR = Material.Material Number`.                                                                                                                                                                                                                                                                                   |
| `Moves`               | `Material Movement` -> `Material`                                                                    | `MSEG.MATNR = Material.Material Number`.                                                                                                                                                                                                                                                                                   |
| `Fulfills`            | `Delivery` -> `Sales Order`; `Delivery Item` -> `Sales Order Item`; reservations -> production order | `LIPS.VGBEL = VBAK.VBELN`; `LIPS.(VGBEL, VGPOS) = VBAP.(VBELN, POSNR)`; `RESB.AUFNR = AFKO.AUFNR`.                                                                                                                                                                                                                         |
| `Posted Against`      | `Material Movement` -> PO item, production order, delivery item, reservation                         | PO receipt: `MSEG.(EBELN, EBELP) = EKPO.(EBELN, EBELP)`; production posting: normalized `MSEG.AUFNR = AFKO.AUFNR`; delivery-related movement: delivery/item references where present, or batch/material/date joins to `LIPS`; reservation consumption: normalized `MSEG.AUFNR = RESB.AUFNR` and `MSEG.MATNR = RESB.MATNR`. |
| `References Document` | Any document/posting -> related source document                                                      | Generic fallback for source references before a more specific semantic link exists. Can be populated from `VBFA`, `MSEG` reference fields, or document-number fields.                                                                                                                                                      |
| `Transports`          | `Shipment` / `Shipment Item` -> `Delivery`                                                           | `VTTK.TKNUM = VTTP.TKNUM`; `VTTP.VBELN = LIKP.VBELN`.                                                                                                                                                                                                                                                                      |
| `Departs From`        | `Shipment` -> origin `Site`                                                                          | Usually inferred from `LIPS.WERKS` for the deliveries on `VTTP.VBELN`, or from shipment route/leg data where available.                                                                                                                                                                                                    |
| `Arrives At`          | `Shipment` -> destination `Site` or `Customer`                                                       | For hub flows, destination can be inferred from receiving plant postings (`MSEG.WERKS`) or delivery route. For direct customer flows, destination can be `LIKP.KUNNR` / ship-to customer and `VTTK.DATEN` arrival.                                                                                                         |

## Why These Changes Were Made

The renamed entities align with terms familiar to supply-chain users working in
SAP: `Vendor`, `Site`, `Material`, `Site Material Data`, and `Material
Valuation`.

The added fields make the ontology useful for future live queries without
persisting the precomputed analytical layer. For example:

- Procurement lead time can be derived from `Purchase Order.Document Date` or
  `Order Date` to a `Material Movement` goods receipt posting.
- Supplier OTIF can be derived from `Purchase Order Schedule Line.Scheduled
Delivery Date` and `Goods Receipt Quantity` versus matched goods receipts.
- Raw and intermediate dwell can be derived from `Material Movement` receipt and
  consumption postings matched by `Material`, `Batch`, and order/component
  references.
- Production yield and consumption variance can be derived from `Production
Order`, `Production Order Item`, `Material Reservation`, BOM membership, and
  `Material Movement` consumption/receipt postings.
- Transit and destination dwell can be derived from `Delivery`, `Shipment`, and
  `Material Movement` events without storing step entities or statistics.

BOM current membership is intentionally derivable from validity/status/deletion
fields (`Valid From Date`, `BOM Status`, `Deletion Indicator`, and `Alternative
BOM`) plus query rules. The ontology stores the source facts; the query decides
which BOM version is current for a material, site, date, and alternative.
