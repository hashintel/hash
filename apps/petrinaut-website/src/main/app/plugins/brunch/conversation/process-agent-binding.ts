export interface ProcessAgentBinding {
  readonly conversationId: string;
  readonly documentId: string;
  /**
   * The net id again. Brunch servers deployed before conversations were
   * scoped by net id reject a binding without it.
   */
  readonly incarnationId?: string;
}

/** The binding the Brunch server checks for a net's conversation. */
export const processAgentBindingFor = (
  documentId: string,
  conversationId: string,
): ProcessAgentBinding => ({
  conversationId,
  documentId,
  incarnationId: documentId,
});
