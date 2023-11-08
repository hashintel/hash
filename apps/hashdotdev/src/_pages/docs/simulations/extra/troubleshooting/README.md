---
title: Troubleshooting & Debugging
slug: simulation/extra/troubleshooting
objectId: 114101d4-8aab-4aad-b191-d19f260a3cc3
description: Debugging simulation logic and application crashes
---

# Troubleshooting & Debugging

There are two types of errors you may encounter when using hCore:

- **errors in simulation logic**: a red message when running a simulation.
- **errors at the application level:** a crash which requires a refresh or other browser action.

## Debugging simulation errors

<Embed type="youtube" url="https://youtu.be/lqEZk0Xp51U" caption="Debugging tutorial" />

A few tips for debugging simulation errors:

- You can use `console.log()` in JavaScript behaviors or `print()` in Python behaviors to output the value of a variable or an expression to the developer console \(**Ctrl+Shift+J** on Windows, or **Cmd+Option+J** on Mac\).
- The Raw Output panel displays the full state of your simulation, which can be useful for figuring out what's going on. Keep in mind though it generates it for the last completed time-step - if your simulation has an error in the middle of a time-step the Raw Output panel will only show you the state that you entered the time-step with.
- Often it's easiest to debug simulations with the bare minimum number of agents, to make it easier to track what's going on. Try reducing the number you create to simplify.
- Please see the [error reference](/docs/simulation/extra/troubleshooting/error-reference) for an explanation of specific errors.

## Troubleshooting crashes

Despite our best efforts, sometimes hCore crashes with a screen that looks like this:

![](https://cdn-us1.hash.ai/site/docs/screenshot-2021-06-15-at-10.24.37.png)

We hope you never see hCore crash. But if you do, there are a few things you can try:

1.  **Refresh the page** This will usually do the trick.
1.  **Clear your browser cache \(saved data\)** Sometimes the files or configuration details that hCore depends on get into a weird state and need to be reset. You can read how to do this on [Chrome](https://support.google.com/accounts/answer/32050), [Firefox](https://support.mozilla.org/en-US/kb/how-clear-firefox-cache), [Edge](https://support.microsoft.com/en-us/microsoft-edge/view-and-delete-browser-history-in-microsoft-edge-00cf7943-a9e1-975a-a33d-ac10ce454ca4). Note that this can also clear saved passwords and other data, so check any settings in the process carefully. You can also **try opening a private/incognito window first** - if it works there, clearing your browser cache is likely to make it work in a regular window.
1.  **Try a different browser** Some errors are specific to certain browsers or browser versions.
1.  **Close other browser windows or browser tabs** Some errors are caused by resources being unavailable, and closing other browser windows can help free them up. If the error details mention _memory_ or _WebGL_ this may help. For errors relating to WebGL \(which renders graphics\), [you can also check your browser's support here](https://get.webgl.org/).
1.  **Contact us** Please [contact us](/contact) if you have trouble recovering from a crash, if you encounter them repeatedly, or if there is other useful information we could add to this page.
