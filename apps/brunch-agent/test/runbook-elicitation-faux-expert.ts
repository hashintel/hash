const replies = [
  "Last Tuesday Line 1 stopped milling because the holding tank before filling was full.",
];

let replyIndex = 0;

export default {
  messages: {
    create: () =>
      Promise.resolve({
        content:
          process.env["BRUNCH_RUNBOOK_EMPTY_EXPERT"] === "1"
            ? []
            : [
                {
                  type: "text",
                  text:
                    replies[replyIndex++] ??
                    "I don't know anything more about that.",
                },
              ],
        model: "faux-vestera-expert",
        usage: {
          input_tokens: 10,
          output_tokens: 10,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
        },
      }),
  },
};
