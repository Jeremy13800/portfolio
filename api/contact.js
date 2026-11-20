// Vercel Function : POST /api/contact (envoi via Resend) et GET /api/contact (jeton de formulaire).
// Voir README, section « Contact ».
import { createHandler } from "./_lib/contact-core.mjs";

export default createHandler();
