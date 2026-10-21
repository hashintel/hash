import { css } from "@hashintel/ds-helpers/css";

/**
 * `?guide`: the tester guide, the same text as ops/projects/flows-editor/prototype-guide.md (keep the two in step).
 * Linked from the briefing as "How to use this prototype".
 */
const h2 = css({
  textStyle: "lg",
  fontWeight: "semibold",
  color: "neutral.fg.heading",
  margin: "[0]",
});
const p = css({ margin: "[0]" });
const list = css({
  margin: "[0]",
  paddingLeft: "5",
  display: "flex",
  flexDirection: "column",
  gap: "1",
});
const code = css({
  fontFamily: "mono",
  textStyle: "xs",
  color: "neutral.fg.body",
});

const urls: [string, string][] = [
  ["?task=1", "Task 1 (also ?task=2, ?task=3)"],
  ["", "A blank flow, with the world briefing"],
  [
    "?home",
    "The flows list: one example flow per design journey, plus the Supplier review",
  ],
  ["?screens", "Every designed screen side by side, grouped by journey"],
  ["?guide", "This guide"],
  ["?results", "The logged task sessions (this browser only)"],
];

const tasks = [
  "A shipment from Northfield Chemicals failed its purity check this morning. You want the quality lead to hear about it right away, and only for failed checks.",
  "At month end you want one row per supplier showing how many shipments came in and how many failed purity. You will share it with your manager.",
  "Any shipment more than two days late should wait for a person to approve it before it joins this month's review. Shipments on time should go straight through.",
];

export const Guide = () => {
  const base = `${globalThis.location.origin}${globalThis.location.pathname}`;
  return (
    <div
      className={`${css({
        minHeight: "[100vh]",
        backgroundColor: "neutral.bgSolid.min",
        fontFamily: "body",
        color: "neutral.fg.body",
        textStyle: "sm",
      })} petrinaut-root`}
    >
      <main
        className={css({
          maxWidth: "[720px]",
          marginX: "auto",
          paddingX: "6",
          paddingY: "12",
          display: "flex",
          flexDirection: "column",
          gap: "6",
        })}
      >
        <h1
          className={css({
            textStyle: "2xl",
            fontWeight: "semibold",
            color: "neutral.fg.heading",
            margin: "[0]",
          })}
        >
          How to use this prototype
        </h1>

        <section
          className={css({
            display: "flex",
            flexDirection: "column",
            gap: "2",
          })}
        >
          <h2 className={h2}>What this is</h2>
          <ul className={list}>
            <li>
              A working editor for HASH Flows, built on the real flow engine.
            </li>
            <li>
              You build small automations for a made-up company, Acme, that
              checks the purity of shipments from its suppliers.
            </li>
            <li>
              We test the design, not you. If something is hard, that is what we
              want to learn.
            </li>
          </ul>
        </section>

        <section
          className={css({
            display: "flex",
            flexDirection: "column",
            gap: "2",
          })}
        >
          <h2 className={h2}>How to open it</h2>
          <ul className={list}>
            {urls.map(([query, what]) => (
              <li key={query || "blank"}>
                <a
                  className={css({ color: "blue.fg.link" })}
                  href={`${base}${query}`}
                >
                  <span className={code}>{query || "/"}</span>
                </a>{" "}
                {what}
              </li>
            ))}
          </ul>
        </section>

        <section
          className={css({
            display: "flex",
            flexDirection: "column",
            gap: "2",
          })}
        >
          <h2 className={h2}>The three tasks</h2>
          <p className={p}>
            Each task opens with the world briefing and a task card. Read the
            card, build the flow, then click "I'm done". There is no score and
            no "right answer" message.
          </p>
          <ol className={list}>
            {tasks.map((task) => (
              <li key={task}>"{task}"</li>
            ))}
          </ol>
          <p className={p}>
            Please think aloud while you work if someone is with you.
          </p>
        </section>

        <section
          className={css({
            display: "flex",
            flexDirection: "column",
            gap: "2",
          })}
        >
          <h2 className={h2}>What is mocked</h2>
          <p className={p}>
            The editor uses the real engine types and checks. These parts are
            made up for the test, and say "mock" where they show:
          </p>
          <ul className={list}>
            <li>
              The company's data: suppliers, shipments, purity checks, people.
            </li>
            <li>
              The actions Send email and Request review, and the triggers Entity
              created, Entity updated and Webhook.
            </li>
            <li>
              Relative dates (Today, Yesterday, N days ago) in conditions,
              default values and a trigger's fixed values, and "is in month".
              The engine stores fixed dates only.
            </li>
            <li>
              Text that mixes typed words and values, lists with several
              sources, and default values on flow inputs.
            </li>
            <li>
              Send email's sender addresses and the files you can attach.
              "Upload a file" only keeps the file's name: nothing uploads.
            </li>
            <li>
              Nothing runs for real: the Run button shows the form a run would
              ask for.
            </li>
          </ul>
        </section>

        <section
          className={css({
            display: "flex",
            flexDirection: "column",
            gap: "2",
          })}
        >
          <h2 className={h2}>What to tell Aakarsh afterwards</h2>
          <ul className={list}>
            <li>Which task, and whether you think the flow does the job.</li>
            <li>Where you got stuck, and what you expected to happen there.</li>
            <li>Anything you looked for and could not find.</li>
            <li>Words that confused you.</li>
            <li>
              If you ran it alone: open <span className={code}>?results</span>,
              click "Copy as JSON", and send it to him. Results stay in your
              browser otherwise.
            </li>
          </ul>
        </section>
      </main>
    </div>
  );
};
