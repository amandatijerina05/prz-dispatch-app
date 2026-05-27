const DEFAULT_SUPABASE_URL = "https://izhgssrghucowblrkfhw.supabase.co";
const DEFAULT_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_V33FLGjmb_EuH-dlS2g8PA_yB_LP5B4";

function sendJson(response, status, body) {
  response.status(status).json(body);
}

function normalizePhone(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (String(phone || "").startsWith("+") && digits.length >= 11) return `+${digits}`;
  return "";
}

function ticketMessage(ticket) {
  const appUrl = process.env.APP_BASE_URL || "https://przdispatch.com";
  return [
    `PRZ work ticket ${ticket.ticketNumber}`,
    `${ticket.customerName || "Customer"} - ${ticket.serviceType || "Service"}`,
    `Date: ${ticket.jobDate || "TBD"} at ${ticket.startTime || "TBD"}`,
    `Site: ${ticket.site || "No site listed"}`,
    ticket.equipmentName ? `Equipment: ${ticket.equipmentName}` : "",
    ticket.priority ? `Priority: ${ticket.priority}` : "",
    `Open driver app: ${appUrl}`,
  ].filter(Boolean).join("\n");
}

async function verifySupabaseUser(token) {
  const supabaseUrl = process.env.SUPABASE_URL || DEFAULT_SUPABASE_URL;
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY || DEFAULT_SUPABASE_PUBLISHABLE_KEY;
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: publishableKey,
      authorization: `Bearer ${token}`,
    },
  });
  return response.ok;
}

module.exports = async function handler(request, response) {
  if (request.method === "OPTIONS") {
    response.status(204).end();
    return;
  }
  if (request.method !== "POST") {
    sendJson(response, 405, { error: "Method not allowed." });
    return;
  }

  const authorization = request.headers.authorization || request.headers.Authorization || "";
  const token = authorization.replace(/^Bearer\s+/i, "");
  if (!token || !(await verifySupabaseUser(token))) {
    sendJson(response, 401, { error: "Sign in before sending SMS messages." });
    return;
  }

  if (!process.env.TELNYX_API_KEY || !process.env.TELNYX_FROM_NUMBER) {
    sendJson(response, 503, { error: "Telnyx is not configured yet. Add TELNYX_API_KEY and TELNYX_FROM_NUMBER in Vercel." });
    return;
  }

  let payload = request.body || {};
  if (typeof payload === "string") {
    try {
      payload = JSON.parse(payload);
    } catch {
      sendJson(response, 400, { error: "Invalid request body." });
      return;
    }
  }

  const to = normalizePhone(payload.driverPhone);
  if (!to) {
    sendJson(response, 400, { error: "Driver phone number must include a valid 10 digit US number." });
    return;
  }
  if (!payload.ticketNumber) {
    sendJson(response, 400, { error: "Ticket number is required." });
    return;
  }

  const telnyxResponse = await fetch("https://api.telnyx.com/v2/messages", {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.TELNYX_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.TELNYX_FROM_NUMBER,
      to,
      text: ticketMessage(payload),
    }),
  });

  const result = await telnyxResponse.json().catch(() => ({}));
  if (!telnyxResponse.ok) {
    const message = result.errors?.[0]?.detail || result.errors?.[0]?.title || "Telnyx could not send the message.";
    sendJson(response, telnyxResponse.status, { error: message });
    return;
  }

  sendJson(response, 200, { ok: true, messageId: result.data?.id || "" });
};
