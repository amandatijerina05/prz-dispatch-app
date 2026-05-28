const DEFAULT_SUPABASE_URL = "https://izhgssrghucowblrkfhw.supabase.co";
const DEFAULT_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_V33FLGjmb_EuH-dlS2g8PA_yB_LP5B4";

function sendJson(response, status, body) {
  response.status(status).json(body);
}

function env() {
  return {
    supabaseUrl: process.env.SUPABASE_URL || DEFAULT_SUPABASE_URL,
    publishableKey: process.env.SUPABASE_PUBLISHABLE_KEY || DEFAULT_SUPABASE_PUBLISHABLE_KEY,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
}

async function verifiedUser(token) {
  const { supabaseUrl, publishableKey } = env();
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: publishableKey,
      authorization: `Bearer ${token}`,
    },
  });
  if (!response.ok) return null;
  return response.json();
}

async function adminProfile(authUserId) {
  const { supabaseUrl, serviceRoleKey } = env();
  const response = await fetch(`${supabaseUrl}/rest/v1/app_users?auth_user_id=eq.${authUserId}&select=id,role,active`, {
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
    },
  });
  const rows = await response.json().catch(() => []);
  return rows[0] || null;
}

async function requireAdmin(request, response) {
  const { serviceRoleKey } = env();
  if (!serviceRoleKey) {
    sendJson(response, 503, { error: "Admin user management is not configured yet. Add SUPABASE_SERVICE_ROLE_KEY in Vercel." });
    return null;
  }
  const authorization = request.headers.authorization || request.headers.Authorization || "";
  const token = authorization.replace(/^Bearer\s+/i, "");
  const user = token ? await verifiedUser(token) : null;
  if (!user?.id) {
    sendJson(response, 401, { error: "Sign in before managing users." });
    return null;
  }
  const profile = await adminProfile(user.id);
  if (!profile?.active || profile.role !== "admin") {
    sendJson(response, 403, { error: "Only admin users can manage logins." });
    return null;
  }
  return user;
}

async function createAuthUser({ email, password, fullName, role }) {
  const { supabaseUrl, serviceRoleKey } = env();
  const response = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName, role },
    }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.msg || result.error_description || result.message || "Could not create Supabase login.");
  return result;
}

async function upsertAppUser({ authUserId, email, fullName, role }) {
  const { supabaseUrl, serviceRoleKey } = env();
  const response = await fetch(`${supabaseUrl}/rest/v1/app_users?on_conflict=username`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      "content-type": "application/json",
      prefer: "resolution=merge-duplicates,return=representation",
    },
    body: JSON.stringify([{
      auth_user_id: authUserId,
      full_name: fullName,
      username: email,
      role,
      active: true,
    }]),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.message || "Could not save app user profile.");
  return result[0];
}

async function updateAuthPassword(authUserId, password) {
  const { supabaseUrl, serviceRoleKey } = env();
  const response = await fetch(`${supabaseUrl}/auth/v1/admin/users/${authUserId}`, {
    method: "PUT",
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ password }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.msg || result.error_description || result.message || "Could not reset password.");
}

async function deactivateAppUser(appUserId) {
  const { supabaseUrl, serviceRoleKey } = env();
  const response = await fetch(`${supabaseUrl}/rest/v1/app_users?id=eq.${appUserId}`, {
    method: "PATCH",
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      "content-type": "application/json",
      prefer: "return=minimal",
    },
    body: JSON.stringify({ active: false }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.message || "Could not remove app user.");
}

module.exports = async function handler(request, response) {
  if (!["POST", "PATCH", "DELETE"].includes(request.method)) {
    sendJson(response, 405, { error: "Method not allowed." });
    return;
  }

  if (!(await requireAdmin(request, response))) return;

  let payload = request.body || {};
  if (typeof payload === "string") {
    try {
      payload = JSON.parse(payload);
    } catch {
      sendJson(response, 400, { error: "Invalid request body." });
      return;
    }
  }

  try {
    if (request.method === "POST") {
      const fullName = String(payload.fullName || "").trim();
      const email = String(payload.email || "").trim().toLowerCase();
      const password = String(payload.password || "");
      const role = String(payload.role || "");
      if (!fullName || !email || !password || !role) throw new Error("Full name, email, role, and temporary password are required.");
      const authUser = await createAuthUser({ email, password, fullName, role });
      const appUser = await upsertAppUser({ authUserId: authUser.id, email, fullName, role });
      sendJson(response, 200, { user: appUser });
      return;
    }

    if (request.method === "PATCH") {
      if (!payload.authUserId || !payload.password) throw new Error("User and new password are required.");
      await updateAuthPassword(payload.authUserId, payload.password);
      sendJson(response, 200, { ok: true });
      return;
    }

    if (!payload.appUserId) throw new Error("User is required.");
    await deactivateAppUser(payload.appUserId);
    sendJson(response, 200, { ok: true });
  } catch (error) {
    sendJson(response, 400, { error: error.message });
  }
};
