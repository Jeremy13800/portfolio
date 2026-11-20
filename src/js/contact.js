/* Fenêtre de contact : une seule modale réutilisable, trois contextes.
 *
 * Envoi : le client ne simule jamais un envoi. Sans endpoint configuré
 * (attribut data-endpoint du <dialog>), aucun message n'est transmis et
 * aucune confirmation n'est affichée. La confirmation n'apparaît qu'après
 * une réponse HTTP 2xx d'un serveur.
 * Aucune clé ni secret n'existe côté navigateur.
 */

const CONTEXTS = {
  email: {
    title: "Envoyez-moi un message",
    desc: "Une question, une idée ou simplement envie d'échanger ? Écrivez-moi directement.",
    subject: "",
  },
  freelance: {
    title: "Parlons de votre projet",
    desc: "Vous avez un site, une application ou une idée en tête ? Présentez-moi votre projet.",
    subject: "Parlons de votre projet",
  },
  opportunity: {
    title: "Une opportunité à me proposer ?",
    desc: "Vous recrutez un développeur web full-stack ? Présentez-moi votre opportunité.",
    subject: "Proposition d'opportunité professionnelle",
  },
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ERRORS = {
  name: "Indiquez votre nom.",
  email: "Indiquez votre adresse e-mail.",
  emailInvalid: "Cette adresse e-mail ne semble pas valide.",
  subject: "Indiquez l'objet de votre message.",
  message: "Écrivez votre message.",
};

function errorMessage(status, code) {
  if (status === 429 || code === "rate_limited") return "Trop de tentatives. Merci de réessayer un peu plus tard.";
  if (code === "too_fast") return "Merci de patienter quelques secondes avant d'envoyer, puis de réessayer.";
  if (code === "validation") return "Le message n'a pas pu être validé. Vérifiez les champs et réessayez.";
  if (code === "not_configured" || status === 503 || status === 404) return "L'envoi n'est pas disponible pour le moment. Votre message n'a pas été envoyé.";
  if (status === 400 || status === 413 || status === 415) return "Le message n'a pas pu être validé. Vérifiez les champs et réessayez.";
  return "L'envoi a échoué. Votre message n'a pas été envoyé : merci de réessayer plus tard.";
}

export default function init() {
  const dialog = document.getElementById("contact-dialog");
  if (!dialog || typeof dialog.showModal !== "function") return; // repli : les liens mailto restent actifs

  const form = dialog.querySelector("#cd-form");
  const body = dialog.querySelector("#cd-body");
  const done = dialog.querySelector("#cd-done");
  const title = dialog.querySelector("#cd-title");
  const desc = dialog.querySelector("#cd-desc");
  const note = dialog.querySelector("#cd-note");
  const status = dialog.querySelector("#cd-status");
  const submit = dialog.querySelector("#cd-submit");
  const label = submit.querySelector("[data-label]");
  const hp = dialog.querySelector("#cd-website");
  const fields = ["name", "email", "subject", "message"].map((n) => ({
    name: n,
    input: dialog.querySelector(`#cd-${n}`),
    error: dialog.querySelector(`#cd-${n}-err`),
  }));
  const endpoint = (dialog.dataset.endpoint || "").trim();
  const root = document.documentElement;

  let trigger = null;
  let ctxKey = "email";
  let token = null; // jeton signé délivré par le serveur (délai minimal, usage unique)
  let sending = false;

  const setError = (f, msg) => {
    f.error.textContent = msg || "";
    f.error.hidden = !msg;
    if (msg) f.input.setAttribute("aria-invalid", "true");
    else f.input.removeAttribute("aria-invalid");
  };
  const setStatus = (msg, kind) => {
    status.textContent = msg || "";
    status.hidden = !msg;
    status.dataset.kind = kind || "";
  };
  const isPristine = () => fields.every((f) => !f.input.value.trim() || f.input.defaultValue === f.input.value);

  const reset = (ctx) => {
    form.reset();
    fields.forEach((f) => setError(f, ""));
    setStatus("");
    sending = false;
    submit.disabled = false;
    submit.removeAttribute("aria-busy");
    label.textContent = "Envoyer le message";
    body.hidden = false;
    done.hidden = true;
    title.textContent = ctx.title;
    desc.textContent = ctx.desc;
    dialog.querySelector("#cd-subject").value = ctx.subject;
    dialog.querySelector("#cd-subject").defaultValue = ctx.subject;
    note.hidden = !!endpoint;
    note.textContent = endpoint ? "" : "L'envoi direct n'est pas encore activé sur ce site : un message saisi ici ne peut pas être transmis pour le moment.";
  };

  const open = (key, from) => {
    const ctx = CONTEXTS[key] || CONTEXTS.email;
    trigger = from || document.activeElement;
    reset(ctx);
    // Verrouille le défilement de la page sans décalage de mise en page
    const sbw = window.innerWidth - root.clientWidth;
    root.style.setProperty("--sbw", `${sbw > 0 ? sbw : 0}px`);
    root.classList.add("modal-open");
    ctxKey = CONTEXTS[key] ? key : "email";
    fetchToken();
    dialog.showModal();
    fields[0].input.focus();
  };

  const fetchToken = async () => {
    token = null;
    if (!endpoint) return;
    try {
      const res = await fetch(endpoint, { method: "GET", headers: { Accept: "application/json" } });
      const json = res.ok ? await res.json() : null;
      token = json && typeof json.token === "string" ? json.token : null;
    } catch {
      token = null; // l'envoi redemandera un jeton
    }
  };

  const close = () => {
    if (dialog.open) dialog.close();
  };

  dialog.addEventListener("close", () => {
    root.classList.remove("modal-open");
    root.style.removeProperty("--sbw");
    if (trigger && typeof trigger.focus === "function") trigger.focus();
    trigger = null;
  });

  // Focus contenu dans la fenêtre : Tab / Maj+Tab bouclent entre le premier et le dernier élément
  dialog.addEventListener("keydown", (e) => {
    if (e.key !== "Tab") return;
    const items = [...dialog.querySelectorAll("button, input, textarea, a[href], [tabindex]:not([tabindex='-1'])")].filter(
      (el) => !el.disabled && !el.closest("[hidden]") && !el.closest(".visually-hidden"),
    );
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === dialog || active === done)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  });

  // Clic sur l'arrière-plan : ferme seulement si rien n'a été saisi (évite de perdre un message)
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog && isPristine() && !sending) close();
  });
  dialog.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", close));

  // Déclencheurs : <a href="mailto:"> conservés comme repli sans JavaScript
  document.querySelectorAll("[data-contact]").forEach((el) => {
    el.setAttribute("aria-haspopup", "dialog");
    el.addEventListener("click", (e) => {
      e.preventDefault();
      open(el.dataset.contact, el);
    });
  });

  // Effacement de l'erreur dès que le champ est corrigé
  fields.forEach((f) => f.input.addEventListener("input", () => f.error.hidden || setError(f, "")));

  const validate = () => {
    let first = null;
    fields.forEach((f) => {
      const v = f.input.value.trim();
      let msg = "";
      if (!v) msg = f.name === "email" ? ERRORS.email : ERRORS[f.name];
      else if (f.name === "email" && !EMAIL_RE.test(v)) msg = ERRORS.emailInvalid;
      setError(f, msg);
      if (msg && !first) first = f;
    });
    if (first) first.input.focus();
    return !first;
  };

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (sending) return;
    setStatus("");
    if (!validate()) return;

    if (!endpoint) {
      setStatus("L'envoi direct n'est pas encore disponible : votre message n'a pas été envoyé.", "error");
      return;
    }

    sending = true;
    submit.disabled = true;
    submit.setAttribute("aria-busy", "true");
    label.textContent = "Envoi en cours…";
    setStatus("Envoi en cours…", "info");

    if (!token) await fetchToken();
    const payload = {
      name: fields[0].input.value.trim(),
      email: fields[1].input.value.trim(),
      subject: fields[2].input.value.trim(),
      message: fields[3].input.value.trim(),
      context: ctxKey,
      website: hp.value, // champ piège : doit rester vide
      token,
    };

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: ctrl.signal,
      });
      const reply = res.ok ? await res.json().catch(() => null) : null;
      if (reply && reply.ok === true) {
        setStatus("");
        body.hidden = true;
        done.hidden = false;
        done.focus();
        return;
      }
      let code = "";
      try { code = (await res.json()).error || ""; } catch { /* corps non JSON */ }
      setStatus(errorMessage(res.status, code), "error");
      fetchToken(); // un jeton ne sert qu'une fois
    } catch {
      fetchToken();
      setStatus("Impossible de joindre le serveur. Votre message n'a pas été envoyé.", "error");
    } finally {
      clearTimeout(timer);
      sending = false;
      submit.disabled = false;
      submit.removeAttribute("aria-busy");
      label.textContent = "Envoyer le message";
    }
  });
}
