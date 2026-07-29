/**
 * Clerk <-> Supabase connectivity check (browser console).
 *
 * Placeholders __SUPABASE_URL__ / __SUPABASE_ANON_KEY__ are substituted from
 * .env.local before use, so this template stays free of credentials:
 *
 *   sed -e "s|__SUPABASE_URL__|$URL|" -e "s|__SUPABASE_ANON_KEY__|$KEY|" \
 *     supabase/tools/connectivity-check.template.js | pbcopy
 *
 * Paste the result into DevTools on a page of the running app while signed in.
 * Read-only: the RPC probe sends a deliberately mismatched Clerk id so the
 * function rejects it instead of provisioning a tenant.
 */
(async () => {
  const URL_ = "__SUPABASE_URL__";
  const KEY = "__SUPABASE_ANON_KEY__";
  const line = (label, value) => console.log(`%c${label}%c ${value}`, "font-weight:bold", "");

  console.log("%c--- ElectraFlow connectivity check ---", "font-weight:bold;font-size:14px");

  // 1. Clerk session
  const clerk = window.Clerk;
  if (!clerk) return console.error("FAIL  window.Clerk missing — Clerk did not load.");
  if (!clerk.session) return console.error("FAIL  No active Clerk session — sign in first.");
  line("OK    Clerk session", clerk.session.id);
  line("      Clerk user", clerk.session.user?.id);

  // 2. JWT template named exactly "supabase"
  let token = null;
  try {
    token = await clerk.session.getToken({ template: "supabase" });
  } catch (e) {
    console.error("FAIL  getToken threw:", e.message);
  }
  if (!token) {
    return console.error(
      'FAIL  No token from template "supabase". Create a JWT template with that exact ' +
        "name in the Clerk dashboard (see docs/phase-5-clerk-supabase-setup.md step 3).",
    );
  }
  line("OK    Clerk JWT", `${token.length} chars`);

  // 3. Claims Supabase will read
  try {
    const claims = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    line("      sub", claims.sub ?? "(missing — RLS cannot resolve the profile)");
    line("      aud", claims.aud ?? "(missing)");
    line("      role", claims.role ?? "(missing)");
    line("      iss", claims.iss ?? "(missing)");
    const secondsLeft = claims.exp ? claims.exp - Math.floor(Date.now() / 1000) : null;
    line("      expires in", secondsLeft === null ? "(no exp)" : `${secondsLeft}s`);
  } catch {
    console.warn("WARN  Could not decode the JWT payload.");
  }

  const headers = {
    apikey: KEY,
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  // 4. Does Supabase accept the Clerk token?
  try {
    const res = await fetch(`${URL_}/rest/v1/profiles?select=id&limit=1`, { headers });
    const body = await res.text();
    if (res.ok) {
      line("OK    Supabase accepts the Clerk JWT", `HTTP ${res.status}, rows: ${body}`);
    } else {
      console.error(`FAIL  Supabase rejected the request — HTTP ${res.status}: ${body}`);
      console.error(
        "      A 401 here means Supabase is not verifying Clerk tokens. Configure the " +
          "Clerk JWKS URL (or third-party auth) in the Supabase dashboard.",
      );
    }
  } catch (e) {
    return console.error(
      `FAIL  Cannot reach ${URL_} at all (${e.message}). Check the URL, that the project ` +
        "is not paused, and that no ad blocker is blocking it.",
    );
  }

  // 5. Does bootstrap_first_user exist? Mismatched id => rejected, never provisions.
  try {
    const res = await fetch(`${URL_}/rest/v1/rpc/bootstrap_first_user`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        p_clerk_user_id: "__connectivity_probe__",
        p_email: "probe@example.com",
        p_full_name: "Probe",
        p_company_name: "Probe",
        p_role: "admin",
      }),
    });
    const body = await res.text();
    if (
      res.status === 404 ||
      body.includes("PGRST202") ||
      body.includes("Could not find the function")
    ) {
      console.error(
        "FAIL  bootstrap_first_user does NOT exist. Run " +
          "supabase/manual/bootstrap_first_user_rpc.sql in the Supabase SQL editor.",
      );
    } else if (body.includes("Clerk identity mismatch")) {
      line("OK    bootstrap_first_user exists", "and correctly rejected the probe identity");
    } else {
      line("?     bootstrap_first_user responded", `HTTP ${res.status}: ${body}`);
    }
  } catch (e) {
    console.error("FAIL  RPC probe could not complete:", e.message);
  }

  // 6. Do the RLS helpers resolve this user?
  for (const fn of ["get_my_clerk_id", "get_my_org_id", "get_my_role"]) {
    try {
      const res = await fetch(`${URL_}/rest/v1/rpc/${fn}`, { method: "POST", headers, body: "{}" });
      const body = (await res.text()).trim();
      const empty = body === "null" || body === "";
      line(
        empty ? `WARN  ${fn}()` : `OK    ${fn}()`,
        empty ? "null — no profile row is linked to this Clerk user yet" : body,
      );
    } catch (e) {
      console.error(`FAIL  ${fn}() — ${e.message}`);
    }
  }

  console.log("%c--- end of check ---", "font-weight:bold");
})();
