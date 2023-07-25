export const createIntegrationActivities = () => ({
  // eslint-disable-next-line @typescript-eslint/require-await,@typescript-eslint/no-unused-vars
  async helloWorldActivity(params: {}): Promise<String> {
    return "Hello, world!";
  },
});
