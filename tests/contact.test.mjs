// Tests de api/contact : Resend et le stockage partagé sont simulés, aucun e-mail réel n'est envoyé.
// Lancer : npm run test:api
import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { createHandler, issueToken, escapeHtml, buildEmail } from "../api/_lib/contact-core.mjs";

const ENV = {
  RESEND_API_KEY: "re_test_fake",
  CONTACT_TO_EMAIL: "dest@example.test",
  CONTACT_FROM_EMAIL: "Portfolio <contact@verified.example.test>",
  CONTACT_FORM_SECRET: "s".repeat(40),
  UPSTASH_REDIS_REST_URL: "https://redis.example.test",
  UPSTASH_REDIS_REST_TOKEN: "fake",
};
const T0 = 1_700_000_000_000;

function memoryStore() {
  const counts = new Map();
  const claimed = new Set();
  return {
    async hit(k) { counts.set(k, (counts.get(k) || 0) + 1); return counts.get(k); },
    async claim(k) { if (claimed.has(k)) return false; claimed.add(k); return true; },
  };
}
function resendMock({ status = 200, body = { id: "mail_1" }, throws = false } = {}) {
  const calls = [];
  const fn = async (url, opts) => {
    calls.push({ url, opts });
    if (throws) throw new Error("network");
    return { ok: status >= 200 && status < 300, status, json: async () => body };
  };
  fn.calls = calls;
  return fn;
}
function setup({ env = ENV, resend = resendMock(), store = memoryStore(), nowMs = T0 + 10_000 } = {}) {
  const handler = createHandler({ env, fetch: resend, store, now: () => nowMs });
  return { handler, resend, store };
}
async function call(handler, { method = "POST", body, headers = {}, raw } = {}) {
  const payload = raw !== undefined ? raw : body === undefined ? "" : JSON.stringify(body);
  const req = Readable.from(payload ? [Buffer.from(payload)] : []);
  req.method = method;
  req.headers = { "content-type": "application/json", "content-length": String(Buffer.byteLength(payload)), "x-real-ip": "203.0.113.9", ...headers };
  const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(b) { this.body = b; } };
  await handler(req, res);
  return { status: res.statusCode, json: JSON.parse(res.body), headers: res.headers };
}
const valid = (over = {}) => ({
  name: "Ada Lovelace", email: "ada@example.test", subject: "Parlons de votre projet", message: "Bonjour,\nun projet.",
  context: "freelance", website: "", token: issueToken(ENV.CONTACT_FORM_SECRET, T0), ...over,
});

test("POST valide : e-mail envoyé à Resend, succès confirmé", async () => {
  const { handler, resend } = setup();
  const r = await call(handler, { body: valid() });
  assert.equal(r.status, 200);
  assert.deepEqual(r.json, { ok: true });
  assert.equal(resend.calls.length, 1);
  const sent = JSON.parse(resend.calls[0].opts.body);
  assert.equal(resend.calls[0].url, "https://api.resend.com/emails");
  assert.equal(resend.calls[0].opts.headers.Authorization, "Bearer re_test_fake");
  assert.equal(sent.reply_to, "ada@example.test");
  assert.equal(sent.from, ENV.CONTACT_FROM_EMAIL);
  assert.deepEqual(sent.to, ["dest@example.test"]);
  assert.match(sent.subject, /Mission freelance/);
  assert.match(sent.text, /Ada Lovelace/);
  assert.equal(r.headers["Cache-Control"], "no-store");
});

test("les trois contextes sont transmis", async () => {
  for (const [ctx, label] of [["email", "Contact général"], ["freelance", "Mission freelance"], ["opportunity", "Opportunité professionnelle"]]) {
    const { handler, resend } = setup();
    const r = await call(handler, { body: valid({ context: ctx }) });
    assert.equal(r.status, 200);
    assert.ok(JSON.parse(resend.calls[0].opts.body).html.includes(label));
  }
});

test("GET délivre un jeton ; PUT/DELETE refusés (405)", async () => {
  const { handler } = setup();
  const g = await call(handler, { method: "GET" });
  assert.equal(g.status, 200);
  assert.match(g.json.token, /^\d+\.[0-9a-f]+\.[0-9a-f]{64}$/);
  for (const m of ["PUT", "DELETE", "PATCH"]) {
    const r = await call(handler, { method: m });
    assert.equal(r.status, 405);
    assert.equal(r.headers.Allow, "GET, POST");
  }
});

test("JSON invalide, tableau, mauvais Content-Type, corps trop gros", async () => {
  const { handler, resend } = setup();
  assert.equal((await call(handler, { raw: "{pas du json" })).json.error, "invalid_json");
  assert.equal((await call(handler, { raw: "[1,2]" })).json.error, "invalid_json");
  assert.equal((await call(handler, { body: valid(), headers: { "content-type": "text/plain" } })).status, 415);
  const big = await call(handler, { body: valid({ message: "a".repeat(20_000) }) });
  assert.equal(big.status, 413);
  const bigNoHeader = await call(handler, { raw: JSON.stringify(valid({ message: "a".repeat(20_000) })), headers: { "content-length": "10" } });
  assert.equal(bigNoHeader.status, 413);
  assert.equal(resend.calls.length, 0);
});

test("champs manquants, e-mail invalide, message trop long, injection d'en-tête", async () => {
  const { handler, resend } = setup();
  const missing = await call(handler, { body: { token: valid().token } });
  assert.equal(missing.status, 400);
  assert.deepEqual(missing.json.fields.sort(), ["email", "message", "name", "subject"]);
  assert.deepEqual((await call(handler, { body: valid({ email: "pas-un-email" }) })).json.fields, ["email"]);
  assert.deepEqual((await call(handler, { body: valid({ message: "x".repeat(5001) }) })).json.fields, ["message"]);
  assert.deepEqual((await call(handler, { body: valid({ subject: "Salut\r\nBcc: x@y.z" }) })).json.fields, ["subject"]);
  assert.deepEqual((await call(handler, { body: valid({ name: 42 }) })).json.fields, ["name"]);
  assert.equal(resend.calls.length, 0);
});

test("honeypot rempli : rejeté, rien n'est envoyé", async () => {
  const { handler, resend } = setup();
  const r = await call(handler, { body: valid({ website: "http://spam.test" }) });
  assert.equal(r.status, 400);
  assert.equal(resend.calls.length, 0);
});

test("jeton : absent, falsifié, trop rapide, expiré, réutilisé", async () => {
  const s = setup();
  assert.equal((await call(s.handler, { body: valid({ token: undefined }) })).json.error, "invalid_token");
  const forged = `${T0 + 0}.abc.${"0".repeat(64)}`;
  assert.equal((await call(s.handler, { body: valid({ token: forged }) })).json.error, "invalid_token");
  const fast = setup({ nowMs: T0 + 1000 });
  assert.equal((await call(fast.handler, { body: valid() })).json.error, "too_fast");
  const old = setup({ nowMs: T0 + 3 * 3600 * 1000 });
  assert.equal((await call(old.handler, { body: valid() })).json.error, "invalid_token");
  const reuse = setup();
  const body = valid();
  assert.equal((await call(reuse.handler, { body })).status, 200);
  assert.equal((await call(reuse.handler, { body })).json.error, "invalid_token");
  assert.equal(reuse.resend.calls.length, 1);
});

test("limitation de débit : 429 après 5 envois par IP", async () => {
  const { handler, resend } = setup();
  const statuses = [];
  for (let i = 0; i < 7; i++) {
    const token = issueToken(ENV.CONTACT_FORM_SECRET, T0 + i);
    statuses.push((await call(handler, { body: valid({ token }) })).status);
  }
  assert.deepEqual(statuses, [200, 200, 200, 200, 200, 429, 429]);
  assert.equal(resend.calls.length, 5);
  const other = await call(handler, { body: valid({ token: issueToken(ENV.CONTACT_FORM_SECRET, T0 + 50) }), headers: { "x-real-ip": "198.51.100.7" } });
  assert.equal(other.status, 200);
});

test("variables absentes : 503 et aucune action", async () => {
  for (const key of Object.keys(ENV)) {
    const env = { ...ENV, [key]: "" };
    const { handler, resend } = setup({ env });
    const r = await call(handler, { body: valid() });
    assert.equal(r.status, 503, key);
    assert.equal(r.json.error, "not_configured");
    assert.equal(resend.calls.length, 0);
  }
  assert.equal((await call(setup({ env: {} }).handler, { method: "GET" })).status, 503);
  assert.equal((await call(setup({ env: { ...ENV, CONTACT_FORM_SECRET: "court" } }).handler, { method: "GET" })).status, 503);
});

test("erreur Resend (4xx, 5xx, réseau, réponse sans id) : jamais de succès", async () => {
  for (const resend of [resendMock({ status: 403, body: { message: "domain not verified" } }), resendMock({ status: 500 }), resendMock({ throws: true }), resendMock({ status: 200, body: {} })]) {
    const { handler } = setup({ resend });
    const r = await call(handler, { body: valid() });
    assert.equal(r.status, 502);
    assert.deepEqual(r.json, { ok: false, error: "send_failed" });
  }
});

test("le stockage partagé en panne ne produit pas de succès", async () => {
  const store = { hit: async () => { throw new Error("down"); }, claim: async () => true };
  const { handler, resend } = setup({ store });
  const r = await call(handler, { body: valid() });
  assert.equal(r.status, 500);
  assert.equal(resend.calls.length, 0);
});

test("contenu HTML échappé dans l'e-mail", () => {
  const mail = buildEmail({ name: "<b>x</b>", email: "a@b.test", subject: "<script>alert(1)</script>", message: "<img src=x onerror=alert(1)> & \"q\"", context: "email" }, { from: "f", to: "t" });
  assert.ok(!mail.html.includes("<script>"));
  assert.ok(!mail.html.includes("<img"));
  assert.ok(!mail.html.includes("<b>x"));
  assert.ok(mail.html.includes("&lt;img src=x onerror=alert(1)&gt; &amp; &quot;q&quot;"));
  assert.equal(escapeHtml("'"), "&#39;");
});

test("le corps de réponse ne contient ni secret ni donnée du visiteur", async () => {
  const { handler } = setup();
  const r = await call(handler, { body: valid() });
  const txt = JSON.stringify(r.json);
  assert.ok(!txt.includes("re_test_fake") && !txt.includes("ada@example.test"));
});

test("stockage Upstash : commandes REST attendues, erreur HTTP propagée", async () => {
  const { upstashStore } = await import("../api/_lib/contact-core.mjs");
  const calls = [];
  const ok = async (url, opts) => { calls.push({ url, opts }); return { ok: true, json: async () => [{ result: "OK" }, { result: 3 }] }; };
  const store = upstashStore({ url: "https://r.example.test/", token: "tok" }, ok);
  assert.equal(await store.hit("k", 60), 3);
  assert.equal(calls[0].url, "https://r.example.test/pipeline");
  assert.equal(calls[0].opts.headers.Authorization, "Bearer tok");
  assert.deepEqual(JSON.parse(calls[0].opts.body), [["SET", "k", "0", "EX", "60", "NX"], ["INCR", "k"]]);
  const bad = upstashStore({ url: "https://r.example.test", token: "t" }, async () => ({ ok: false, status: 401 }));
  await assert.rejects(() => bad.hit("k", 60));
});
