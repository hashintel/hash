# Sharing a Net

On the Petrinaut demo website, choose **Share** in the top bar to create a link containing a copy of the current net. Recipients can open it in another browser without an account.

## Create a snapshot link

1. Open the net and choose **Share**.
2. Leave **Include current view** selected to include the current mode, scenario, subnet, and selected item. Clear it to open the snapshot at its default view.
3. Wait for the link to appear, then choose **Copy snapshot link**.

The snapshot includes the net's title, layout, descriptions, code, parameters, types, subnets, scenarios, and metric definitions. It captures the document when you open the Share dialog. Close and reopen the dialog to capture later edits.

Running simulations, result history, AI conversations, and browser preferences are not included. Including the current view restores a location in the editor; it does not resume a running simulation.

The document is compressed into the link. Anyone with the complete link can open the snapshot. Your later edits do not change it, and deleting your local document does not revoke it.

## Open a shared snapshot

A snapshot opens read-only. You can inspect the net, navigate between views, and run simulations. Choose **Make a local copy** to save an editable copy in your browser. The copy receives its own local document URL and keeps your current view.

Simply opening a snapshot does not add it to your saved documents. You can bookmark the snapshot link or make a local copy to return to it later.

## Share a file instead

Choose **Download file** in the Share dialog to export the captured net as a YAML file. The recipient can import it from **Menu > Import**.

Large nets may exceed the snapshot-link limit. In that case, the dialog offers the file download and leaves **Copy snapshot link** disabled. Files are also useful when an application truncates a long link.

If a snapshot will not open, ask the sender for the complete link or a file export. A message about a newer snapshot format means you should refresh Petrinaut before trying again.
