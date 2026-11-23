/** External channels a customer can opt into (in-app is always on). */
export const NOTIFICATION_CHANNELS_FOR_CUSTOMER = ['PUSH', 'SMS', 'WHATSAPP', 'EMAIL'] as const;
export type CustomerChannel = (typeof NOTIFICATION_CHANNELS_FOR_CUSTOMER)[number];
export const CHANNEL_LABEL: Record<CustomerChannel | 'IN_APP', string> = {
  IN_APP: 'In the app / portal', PUSH: 'Phone notification (app)', SMS: 'SMS', WHATSAPP: 'WhatsApp', EMAIL: 'Email',
};
