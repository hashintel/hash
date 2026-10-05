---
layer: website.plugins
role: The website's assistant integrations, one folder each
---

Every folder here holds one assistant integration of the demo site, grouped in
a few sub-folders when there is enough of it to need grouping. `_shared/` holds
what two of them share; today that is the conversation contract between Brunch
and Voice.

| Folder          | Holds                                                                             |
| --------------- | --------------------------------------------------------------------------------- |
| `brunch/`       | The Brunch integration: conversation identity and history, host tools, the Ledger |
| `voice/`        | Voice mode on the Brunch assistant: the interview, the Live and Realtime paths    |
| `petrinaut-ai/` | The message store of Petrinaut's own assistant, one saved transcript per document |

The demo shell (`../local-storage-demo/local-storage-demo-app.tsx`) builds the
chat configuration from these files and passes it to `<Petrinaut aiAssistant>`.
