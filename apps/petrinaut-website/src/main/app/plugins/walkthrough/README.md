# Welcome guide plugin

`plugin.tsx` declares the guide with its one setting, "Show welcome guide" in
the General section, and its body: open the dialog when the editor view
mounts and the setting is on, turn the setting off when the guide is
dismissed, and tell the editor it is covered meanwhile. The steps, with their
videos, are `walkthrough-steps.tsx`; the dialog is `plugin/walkthrough-dialog.tsx`.
