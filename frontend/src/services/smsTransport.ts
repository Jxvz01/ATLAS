/**
 * Future SMS / Hardware Gateway Fallback Transport Abstraction.
 * ATLAS does NOT fabricate SMS delivery in web or unconfigured Android builds.
 */
export interface SmsTransportResult {
  sent: boolean;
  reason: string;
}

export interface SmsFallbackTransport {
  readonly name: string;
  isAvailable: () => boolean;
  sendCompactPayload: (recipient: string, compactText: string) => Promise<SmsTransportResult>;
}

export const smsFallbackTransport: SmsFallbackTransport = {
  name: 'Unconfigured SMS Gateway',
  isAvailable: () => false,
  sendCompactPayload: async (_recipient: string, _compactText: string): Promise<SmsTransportResult> => {
    return {
      sent: false,
      reason: 'SMS fallback transport is not configured (requires native Android SEND_SMS permission or hardware GSM gateway).',
    };
  },
};
