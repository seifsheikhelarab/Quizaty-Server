export const sendWhatsAppMessage = async (to: string, message: string): Promise<void> => {
  if (!to || !message) return;

  try {
    // Placeholder implementation.
    // Integrate with your WhatsApp provider (e.g. Twilio, WhatsApp Cloud API)
    // by replacing this log with a real API call.
    console.log('[WhatsApp]', { to, message });
  } catch (error) {
    console.error('Failed to send WhatsApp message', error);
  }
};

