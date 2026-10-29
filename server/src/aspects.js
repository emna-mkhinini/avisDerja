// Détection des thèmes (aspects) d'un avis, en derja écrit en arabe ou en latin (arabizi).
// Approche par lexique : simple, explicable, et facile à enrichir.

export const ASPECTS = {
  prix: {
    label: "Prix",
    words: ["prix", "soum", "soumou", "soumha", "ghali", "ghlé", "rkhis", "r5is", "flous", "dinar", "dt", "promo", "remise", "cher",
      "سوم", "السوم", "سومو", "السعر", "سعر", "غالي", "رخيص", "فلوس", "دينار", "بروموسيون"],
  },
  livraison: {
    label: "Livraison",
    words: ["livraison", "livreur", "wsol", "wsolni", "wsel", "wosel", "t2a5er", "t2a5ret", "ta5ir", "retard", "colis", "aramex",
      "توصيل", "التوصيل", "وصل", "وصلني", "وصلتني", "تأخر", "تاخر", "تعطل", "ليفريزون", "الكولي"],
  },
  qualite: {
    label: "Qualité",
    words: ["qualité", "qualite", "kalite", "jawda", "mkasser", "mkassra", "metfasa5", "tkasser", "matin", "solide", "fragile", "défaut", "tissu",
      "جودة", "الجودة", "مكسر", "مكسرة", "تكسر", "متين", "كواليتي", "خامة", "الخامة"],
  },
  service: {
    label: "Service client",
    words: ["service", "sav", "client", "jewbouni", "jawbouni", "rodou", "rodouch", "telephone", "téléphone", "tel", "accueil", "ma3amla", "réponse", "message",
      "سرفيس", "خدمة", "الخدمة", "جاوبوني", "ردو", "ردوش", "تلفون", "المعاملة", "معاملة"],
  },
  conformite: {
    label: "Conformité",
    words: ["taille", "9ies", "9yes", "9as", "couleur", "lawn", "photo", "taswira", "conforme", "description", "mich kif", "mouch kif", "different",
      "قياس", "القياس", "لون", "اللون", "التصويرة", "تصويرة", "الصورة", "موش كيف", "مطابق"],
  },
};

// Même logique que la normalisation Python : on ramène les variantes d'écriture vers une forme commune.
export function normalize(text) {
  return String(text)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/(.)\1{2,}/gu, "$1$1")
    .replace(/[إأآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[ً-ْ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Les mots-clés sont normalisés une seule fois, au chargement.
const LEXICON = Object.entries(ASPECTS).map(([key, a]) => ({
  key,
  patterns: [...new Set(a.words.map(normalize))].map((w) =>
    // \p{L} : une lettre de n'importe quel alphabet. On cherche le mot entier,
    // avec des préfixes arabes facultatifs (و، ب، ف، ل، ال…) pour l'écriture arabe.
    new RegExp(`(?<![\\p{L}\\p{N}])(?:[وبفلك]{0,2}(?:ال)?)${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}])`, "u")),
}));

/** Renvoie la liste des aspects mentionnés dans le texte, par ex. ["prix", "livraison"]. */
export function detectAspects(text) {
  const norm = normalize(text);
  return LEXICON.filter(({ patterns }) => patterns.some((re) => re.test(norm))).map(({ key }) => key);
}
