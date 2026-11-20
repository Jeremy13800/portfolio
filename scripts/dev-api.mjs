// Serveur local de test pour /api/contact : exécute le vrai gestionnaire (api/_lib/contact-core.mjs)
// avec Resend et le stockage partagé SIMULÉS. Aucun e-mail n'est envoyé, aucune clé n'est nécessaire.
// Usage : npm run dev:api (port 3001) puis npm run dev (Vite relaie /api vers ce serveur).
// Variables optionnelles : MOCK_RESEND=ok|error|network, PORT.
import { createServer } from "node:http";
import { createHandler } from "../api/_lib/contact-core.mjs";

const mode = process.env.MOCK_RESEND || "ok";
const counts = new Map();
const claimed = new Set();
const store = {
  async hit(k) { counts.set(k, (counts.get(k) || 0) + 1); return counts.get(k); },
  async claim(k) { if (claimed.has(k)) return false; claimed.add(k); return true; },
};
const fakeResend = async (_url, opts) => {
  const mail = JSON.parse(opts.body);
  console.log(`[mock Resend] mode=${mode} · ${mail.subject.length} car. d'objet · reply_to renseigné : ${Boolean(mail.reply_to)}`); // jamais le message
  if (mode === "network") throw new Error("simulated");
  if (mode === "error") return { ok: false, status: 500, json: async () => ({}) };
  return { ok: true, status: 200, json: async () => ({ id: "mock_" + Date.now() }) };
};

const handler = createHandler({
  env: {
    RESEND_API_KEY: "mock", CONTACT_TO_EMAIL: "mock@localhost.invalid", CONTACT_FROM_EMAIL: "mock@localhost.invalid",
    CONTACT_FORM_SECRET: "local-dev-secret-local-dev-secret-0123", UPSTASH_REDIS_REST_URL: "mock", UPSTASH_REDIS_REST_TOKEN: "mock",
  },
  fetch: fakeResend,
  store,
});

const port = Number(process.env.PORT) || 3001;
createServer((req, res) => {
  if (!req.url.startsWith("/api/contact")) { res.statusCode = 404; return res.end(); }
  handler(req, res);
}).listen(port, "127.0.0.1", () => console.log(`API de test sur http://127.0.0.1:${port}/api/contact (Resend simulé : ${mode})`));
