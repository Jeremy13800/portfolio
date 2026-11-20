// Logique du formulaire de contact (Vercel Function + Resend).
// Les dépendances (variables d'environnement, fetch, stockage partagé) sont injectées
// pour pouvoir tester sans envoyer de vrai e-mail. Ce dossier est ignoré par Vercel (préfixe « _ »).
import { createHmac, createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const LIMITS = { name: 100, email: 254, subject: 150, message: 5000, body: 16 * 1024 };
export const CONTEXTS = {
  email: "Contact général",
  freelance: "Mission freelance",
  opportunity: "Opportunité professionnelle",
};
const MIN_AGE_MS = 3000; // délai minimal entre l'ouverture du formulaire et l'envoi
const MAX_AGE_MS = 2 * 60 * 60 * 1000; // validité d'un jeton : 2 h
const RATE = { perIp: 5, perIpWindowS: 3600, global: 100, globalWindowS: 86400 };
const EMAIL_RE = /^[^\s@<>"',;:\\()[\]]+@[^\s@<>"',;:\\()[\]]+\.[^\s@<>"',;:\\()[\]]+$/;
const CTRL_RE = /[\u0000-\u001f\u007f\u2028\u2029]/; // inclut CR/LF : injection d'en-têtes
const CTRL_MULTI_RE = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/; // le message garde ses retours à la ligne

export const escapeHtml = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/* ---- Configuration -------------------------------------------------------- */
export function readConfig(env) {
  const cfg = {
    apiKey: env.RESEND_API_KEY,
    to: env.CONTACT_TO_EMAIL,
    from: env.CONTACT_FROM_EMAIL,
    secret: env.CONTACT_FORM_SECRET,
    redisUrl: env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL,
    redisToken: env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN,
  };
  const missing = Object.entries(cfg).filter(([, v]) => !v || !String(v).trim()).map(([k]) => k);
  if (cfg.secret && cfg.secret.length < 32) missing.push("secret(>=32)");
  return { cfg, ok: missing.length === 0 };
}

/* ---- Jeton signé (délai minimal non falsifiable, usage unique) ---------------- */
export const issueToken = (secret, now = Date.now()) => {
  const body = `${now}.${randomBytes(12).toString("hex")}`;
  return `${body}.${createHmac("sha256", secret).update(body).digest("hex")}`;
};
export function verifyToken(secret, token, now = Date.now()) {
  if (typeof token !== "string" || token.length > 200) return { ok: false, code: "invalid_token" };
  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false, code: "invalid_token" };
  const [ts, nonce, sig] = parts;
  const expected = createHmac("sha256", secret).update(`${ts}.${nonce}`).digest("hex");
  const a = Buffer.from(sig, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, code: "invalid_token" };
  const age = now - Number(ts);
  if (!Number.isFinite(age) || age > MAX_AGE_MS) return { ok: false, code: "invalid_token" };
  if (age < MIN_AGE_MS) return { ok: false, code: "too_fast" };
  return { ok: true, nonce };
}

/* ---- Stockage partagé : Upstash Redis via REST (compatible Vercel) ------------ */
export function upstashStore({ url, token }, fetchFn = fetch) {
  const run = async (commands) => {
    const res = await fetchFn(`${url.replace(/\/+$/, "")}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(commands),
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) throw new Error(`store ${res.status}`);
    return (await res.json()).map((r) => r.result);
  };
  return {
    // Compteur à fenêtre fixe : SET NX crée la clé avec expiration, INCR l'incrémente.
    async hit(key, windowS) {
      const [, count] = await run([["SET", key, "0", "EX", String(windowS), "NX"], ["INCR", key]]);
      return Number(count);
    },
    async claim(key, ttlS) {
      const [r] = await run([["SET", key, "1", "NX", "EX", String(ttlS)]]);
      return r === "OK";
    },
  };
}

/* ---- Utilitaires HTTP ------------------------------------------------------- */
const send = (res, status, payload, extra = {}) => {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  for (const [k, v] of Object.entries(extra)) res.setHeader(k, v);
  res.end(JSON.stringify(payload));
};
const fail = (res, status, error, extra) => send(res, status, { ok: false, error }, extra);

async function readJson(req, limit) {
  const declared = Number(req.headers["content-length"]);
  if (Number.isFinite(declared) && declared > limit) return { error: "payload_too_large" };
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) return { error: "payload_too_large" };
    chunks.push(chunk);
  }
  try {
    const data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!data || typeof data !== "object" || Array.isArray(data)) return { error: "invalid_json" };
    return { data };
  } catch {
    return { error: "invalid_json" };
  }
}

const clientIp = (req) =>
  String(req.headers["x-real-ip"] || req.headers["x-vercel-forwarded-for"] || req.headers["x-forwarded-for"] || "unknown")
    .split(",")[0]
    .trim();

/* ---- Validation ------------------------------------------------------------- */
export function validate(data) {
  const str = (v) => (typeof v === "string" ? v.trim() : null);
  const name = str(data.name);
  const email = str(data.email);
  const subject = str(data.subject);
  const message = typeof data.message === "string" ? data.message.replace(/\r\n?/g, "\n").trim() : null;
  const fields = {};
  if (!name || name.length > LIMITS.name || CTRL_RE.test(name)) fields.name = true;
  if (!email || email.length > LIMITS.email || !EMAIL_RE.test(email) || CTRL_RE.test(email)) fields.email = true;
  if (!subject || subject.length > LIMITS.subject || CTRL_RE.test(subject)) fields.subject = true;
  if (!message || message.length > LIMITS.message || CTRL_MULTI_RE.test(message)) fields.message = true;
  const context = typeof data.context === "string" && Object.hasOwn(CONTEXTS, data.context) ? data.context : "email";
  return { ok: Object.keys(fields).length === 0, fields, value: { name, email, subject, message, context } };
}

/* ---- Contenu de l'e-mail (tout est échappé) ------------------------------------ */
export function buildEmail({ name, email, subject, message, context }, cfg) {
  const label = CONTEXTS[context];
  const html = `<!doctype html><html lang="fr"><body style="font-family:system-ui,sans-serif;line-height:1.5;color:#111">
<p><strong>Contexte :</strong> ${escapeHtml(label)}</p>
<p><strong>Nom :</strong> ${escapeHtml(name)}<br><strong>E-mail :</strong> ${escapeHtml(email)}<br><strong>Objet :</strong> ${escapeHtml(subject)}</p>
<hr><div style="white-space:pre-wrap">${escapeHtml(message)}</div></body></html>`;
  const text = `Contexte : ${label}\nNom : ${name}\nE-mail : ${email}\nObjet : ${subject}\n\n${message}\n`;
  return { from: cfg.from, to: [cfg.to], reply_to: email, subject: `[Portfolio · ${label}] ${subject}`, html, text };
}

/* ---- Gestionnaire ------------------------------------------------------------- */
export function createHandler(deps = {}) {
  const getEnv = () => deps.env || process.env;
  const fetchFn = deps.fetch || fetch;
  const now = deps.now || (() => Date.now());

  return async function handler(req, res) {
    try {
      if (req.method !== "GET" && req.method !== "POST") return fail(res, 405, "method_not_allowed", { Allow: "GET, POST" });

      const { cfg, ok } = readConfig(getEnv());
      if (!ok) return fail(res, 503, "not_configured");
      const store = deps.store || upstashStore({ url: cfg.redisUrl, token: cfg.redisToken }, fetchFn);

      // GET : délivre un jeton signé horodaté (le navigateur le renvoie avec le message)
      if (req.method === "GET") return send(res, 200, { ok: true, token: issueToken(cfg.secret, now()) });

      if (!/^application\/json\b/i.test(String(req.headers["content-type"] || ""))) return fail(res, 415, "unsupported_media_type");
      const parsed = await readJson(req, LIMITS.body);
      if (parsed.error) return fail(res, parsed.error === "payload_too_large" ? 413 : 400, parsed.error);
      const data = parsed.data;

      // Honeypot : un humain ne voit pas ce champ
      if (typeof data.website === "string" && data.website.trim() !== "") return fail(res, 400, "invalid_request");

      const v = validate(data);
      if (!v.ok) return send(res, 400, { ok: false, error: "validation", fields: Object.keys(v.fields) });

      const tok = verifyToken(cfg.secret, data.token, now());
      if (!tok.ok) return fail(res, 400, tok.code);

      // Limitation de débit partagée entre instances (Redis) : par IP (hachée) puis globale
      const ipHash = createHash("sha256").update(`${cfg.secret}|${clientIp(req)}`).digest("hex").slice(0, 32);
      const [ipCount, globalCount] = await Promise.all([
        store.hit(`contact:ip:${ipHash}`, RATE.perIpWindowS),
        store.hit("contact:global", RATE.globalWindowS),
      ]);
      if (ipCount > RATE.perIp || globalCount > RATE.global) {
        return fail(res, 429, "rate_limited", { "Retry-After": String(RATE.perIpWindowS) });
      }

      // Jeton à usage unique
      if (!(await store.claim(`contact:nonce:${tok.nonce}`, MAX_AGE_MS / 1000))) return fail(res, 400, "invalid_token");

      let r;
      try {
        r = await fetchFn("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify(buildEmail(v.value, cfg)),
          signal: AbortSignal.timeout(10000),
        });
      } catch {
        console.error("contact: resend unreachable");
        return fail(res, 502, "send_failed");
      }
      let out = null;
      try { out = await r.json(); } catch { /* corps non JSON */ }
      if (!r.ok || !out || typeof out.id !== "string") {
        console.error(`contact: resend refused (status ${r.status})`); // jamais le contenu du message
        return fail(res, 502, "send_failed");
      }
      return send(res, 200, { ok: true });
    } catch (e) {
      console.error(`contact: internal error (${e && e.name})`);
      return fail(res, 500, "server_error");
    }
  };
}
