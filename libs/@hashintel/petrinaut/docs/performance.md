# Performance

The **Performance** plugin is included in Petrinaut. Click **Toggle performance
monitor** in the top bar to show its FPS counter. Click the counter's FPS header
to expand frame timing, plugin activity, and measurement guidance in one dark
widget. Each section collapses separately. Click the header again to return to
the compact counter, or its close button to hide the whole monitor.

The monitor starts hidden. **User settings → General → Performance** has
**Show FPS counter** and **Expand performance details** switches. Expansion
applies when the counter is visible. Hosts with a command palette list **Toggle
performance monitor**. Visibility and expansion are saved across nets. **User
settings → Plugins → Performance** switches the whole plugin off, including its
button and command.

## Browser FPS

The number counts browser animation callbacks per second. The chart keeps the
last 24 samples, with the newest on the right. Each sample covers at least
250 ms, so the chart usually spans about six seconds. A stall extends the
sample rather than being smoothed away.

Each square represents about 10 FPS, up to six squares. The number can exceed
60 on a faster display. Columns are green from 50 FPS, amber from 30, and red
below 30. These thresholds help compare samples; they are not a target for
every display.

A blocked browser freezes the counter until it can run again. The next sample
includes that delay. Switching away from the tab pauses collection; returning
starts a fresh history. FPS does not establish how many frames were painted or
which part of the page caused a delay.

## Performance information

- **Longest frame gap** shows the largest delay between animation callbacks in
  the latest sample.
- **Collector** shows measured synchronous collection and notification work in
  the preceding sample. Drawing the monitor and React's profiling bookkeeping
  add cost beyond this value.
- **First publish** shows elapsed time from creation of a plugin host to its
  first contribution publication. Scheduling, other startup work and loading
  waits can be included. It is not isolated plugin CPU time or time to paint.
- **Publ./s** shows average contribution publications per second since
  observation began. A plugin's descendants can update separately.
- **React ms** shows total render work associated with committed updates when
  React supplies profiling callbacks. Standard production builds leave it
  unavailable. It excludes commit-phase work, layout and paint.

Open **What these measurements mean** for the same guidance beside the data.
React Compiler can reuse output and calculations, so frequent updates alone
do not establish wasted work. Component invocation counts are not measured.
Development Strict Mode can repeat work; use production measurements for
comparisons of user interactions.

The monitor includes its own activity. Compare the same interaction with the
monitor off and on. Collapsing details keeps collection and FPS history running.
Closing the monitor stops collection unless another plugin is reading performance
data. Collection keeps only a short frame history and the active plugin rows.
Counts restart when monitoring resumes; first-publication latency lasts until that plugin host remounts.
