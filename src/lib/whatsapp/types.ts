export type WhatsAppProvider = 'meta' | 'wappbiz';

export interface WhatsAppIncomingMessage {
  provider: WhatsAppProvider;
  messageId: string;
  phoneNumber: string;
  text?: string;
  timestamp?: string;
  contactName?: string;
  rawPayload?: unknown;
}
