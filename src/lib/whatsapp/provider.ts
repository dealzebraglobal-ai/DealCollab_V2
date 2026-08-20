import { WhatsAppProvider } from './types';
import { sendMetaMessage, sendMetaButtons, sendMetaOTP, sendMetaMatchNotification } from './meta';
import { sendWappBizMessage, sendWappBizButtons, sendWappBizOTP, sendWappBizMatchNotification } from './wappbiz';

export async function sendWhatsAppMessage(provider: WhatsAppProvider, phone: string, text: string) {
  if (provider === 'wappbiz') {
    return sendWappBizMessage(phone, text);
  }
  return sendMetaMessage(phone, text);
}

export async function sendWhatsAppButtons(provider: WhatsAppProvider, phone: string, text: string, buttons: Array<{ id: string; title: string }>) {
  if (provider === 'wappbiz') {
    return sendWappBizButtons(phone, text, buttons);
  }
  return sendMetaButtons(phone, text, buttons);
}

export async function sendWhatsAppOTP(provider: WhatsAppProvider, phone: string, otp: string) {
  if (provider === 'wappbiz') {
    return sendWappBizOTP(phone, otp);
  }
  return sendMetaOTP(phone, otp);
}

export async function sendWhatsAppMatchNotification(provider: WhatsAppProvider, phone: string, params: {
  companySummary: string;
  matchScore: number;
  magicLinkUrl: string;
}) {
  if (provider === 'wappbiz') {
    return sendWappBizMatchNotification(phone, params);
  }
  return sendMetaMatchNotification(phone, params);
}
