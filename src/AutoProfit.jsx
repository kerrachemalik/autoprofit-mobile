import React, { useState, useMemo, useEffect, useRef } from "react";
import {
  Car, Camera, CameraOff, ScanLine, TrendingUp, History as HistoryIcon, User, Home as HomeIcon,
  ChevronRight, CheckCircle2, AlertTriangle, XCircle, ArrowLeft, LogOut,
  CreditCard, Lock, Mail, Sparkles, Gauge, Trash2, Info, MapPin, Zap, Cog,
  DoorClosed, Users, Wrench, X, ShieldCheck, HelpCircle, FileText
} from "lucide-react";

// ---------- Fonts ----------
const FontImport = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap');
    .ap-root { font-family: 'Inter', sans-serif; }
    .ap-display { font-family: 'Space Grotesk', sans-serif; font-variant-numeric: tabular-nums; }
    @keyframes ap-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
    @keyframes ap-pulse { 0%, 100% { opacity: 0.4; } 50% { opacity: 1; } }
  `}</style>
);

const DAMAGE_POOL = [
  { part: "Pare-choc avant", level: "orange", label: "Dégâts modérés", min: 450, max: 700 },
  { part: "Aile avant droite", level: "yellow", label: "Rayures / petite déformation", min: 250, max: 400 },
  { part: "Phare avant droit", level: "red", label: "Remplacement probable", min: 600, max: 900 },
];

const PROBLEM_LIST = [
  "Moteur", "Boîte de vitesses", "Embrayage", "Turbo", "Injecteurs", "FAP", "EGR",
  "Freins", "Suspension", "Pneus", "Climatisation", "Électronique",
  "Voyant moteur", "Batterie", "Distribution", "Fuite d'huile",
];

const PROBLEM_BASE_COST = {
  "Moteur": 1800, "Boîte de vitesses": 1500, "Embrayage": 900, "Turbo": 1200,
  "Injecteurs": 700, "FAP": 900, "EGR": 500, "Freins": 350, "Suspension": 450,
  "Pneus": 300, "Climatisation": 400, "Électronique": 500, "Voyant moteur": 250,
  "Batterie": 180, "Distribution": 600, "Fuite d'huile": 350,
};

const SEVERITY_LEVELS = [
  { key: "leger", label: "Léger", color: "#3FBF7F", mult: 0.5, riskPct: 0.005 },
  { key: "modere", label: "Modéré", color: "#E8A33D", mult: 1, riskPct: 0.015 },
  { key: "important", label: "Important", color: "#E5484D", mult: 1.8, riskPct: 0.035 },
  { key: "critique", label: "Critique", color: "#7A7A85", mult: 2.8, riskPct: 0.06 },
];

// ---------------------------------------------------------------------------
// CARTE GRISE — calcul officiel simplifié (Y1 taxe régionale + Y4 gestion + Y5 acheminement)
// ---------------------------------------------------------------------------
const CARTE_GRISE_PRICES = {
  "Auvergne-Rhône-Alpes": 43.0,
  "Bourgogne-Franche-Comté": 51.0,
  "Bretagne": 55.0,
  "Centre-Val de Loire": 55.0,
  "Corse": 27.0,
  "Grand Est": 48.0,
  "Hauts-de-France": 36.2,
  "Île-de-France": 54.95,
  "Normandie": 46.0,
  "Nouvelle-Aquitaine": 45.0,
  "Occitanie": 47.0,
  "Pays de la Loire": 51.0,
  "Provence-Alpes-Côte d'Azur": 51.2,
};
const CARTE_GRISE_REGIONS = Object.keys(CARTE_GRISE_PRICES);
const CG_Y4 = 11.0;
const CG_Y5 = 2.76;
const CG_SERVICE_FEE = 30.0; // frais de dossier moyen fixe du prestataire carte grise

// isExempt = 100% Électrique ou Hydrogène uniquement (hybride, GPL, essence, diesel = 100% du tarif)
// isPro = professionnel de l'achat-revente : taxe régionale, taxe de gestion et acheminement à 0 €
function computeCarteGrise(cv, region, isOld, isExempt, isPro) {
  if (isPro) {
    return { y1: 0, y4: 0, y5: 0, antsFees: 0, serviceFee: 0, total: 0 };
  }
  let y1 = isExempt ? 0 : cv * (CARTE_GRISE_PRICES[region] ?? 0);
  if (!isExempt && isOld) y1 = y1 / 2;
  const antsFees = CG_Y4 + CG_Y5;
  // Arrondi strict du total pour que "Prix + Carte grise" affiché corresponde
  // exactement à "Coût d'achat total" affiché ailleurs, sans écart d'un euro.
  const total = Math.round(y1 + antsFees + CG_SERVICE_FEE);
  return { y1, y4: CG_Y4, y5: CG_Y5, antsFees, serviceFee: CG_SERVICE_FEE, total };
}

function currency2(n) {
  return n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
}
const FREE_WEEKLY_LIMIT = 3;

// ---------------------------------------------------------------------------
// COUCHE "PROVIDERS" — le véhicule est saisi manuellement par l'utilisateur
// (marque/modèle/motorisation/année/boîte/km), avec un VIN optionnel qui
// pré-remplit ce même formulaire via l'API gratuite NHTSA (backend).
//
// - kilométrage -> AUCUNE source publique fiable pour un acheteur tiers
//   (HistoVec existe mais n'est consultable que par le propriétaire du
//   véhicule) : c'est une donnée que l'utilisateur doit toujours saisir.
// - prix du marché -> comparables réels (La Centrale, via le backend) ;
//   si aucun comparable n'est trouvé, estimation neutre marquée isDemo: true.
// ---------------------------------------------------------------------------

function hashString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h;
}

// Recherche de comparables réels (La Centrale, via le backend) pour estimer
// la cote du véhicule. Si aucun comparable n'est trouvé (marque/modèle trop
// rares, panne fournisseur...), on retombe sur une estimation neutre plutôt
// que de bloquer l'utilisateur — toujours marquée isDemo: true dans ce cas.
const FUEL_TO_SEARCH_ENERGY = { Essence: "ess", Diesel: "dies" };

async function fetchMarketData(vehicle, token) {
  try {
    const energy = FUEL_TO_SEARCH_ENERGY[vehicle.fuel];
    const res = await apiFetch("/api/search-cars", {
      method: "POST",
      token,
      body: {
        make: vehicle.brand,
        model: vehicle.model,
        ...(energy ? { energy } : {}),
        yearMin: vehicle.year - 1,
        yearMax: vehicle.year + 1,
        targetMileage: vehicle.km,
        limit: 20,
      },
    });
    if (!res.count) throw new Error("Aucun comparable trouvé");
    const mean = res.stats.estimatedValue ?? res.stats.averagePrice;
    const comparables = res.listings.slice(0, 5).map((l) => ({
      label: `${l.make} ${l.model} ${l.version || ""}`.trim(),
      year: l.year, km: l.mileage, price: l.price, location: l.department,
    }));
    const confidence = res.count >= 20 ? "élevée" : res.count >= 8 ? "moyenne" : "faible";
    return { count: res.count, mean, median: mean, min: res.stats.minPrice, max: res.stats.maxPrice, confidence, comparables, isDemo: false };
  } catch (e) {
    // Estimation neutre : on ne peut pas laisser un utilisateur sans aucune
    // fourchette de prix, mais on le marque clairement comme non fiable.
    const fallbackMean = 12000;
    return { count: 0, mean: fallbackMean, median: fallbackMean, min: Math.round(fallbackMean * 0.8), max: Math.round(fallbackMean * 1.2), confidence: "faible", comparables: [], isDemo: true };
  }
}

// Décode un VIN via le backend (NHTSA, gratuit) et pré-remplit le formulaire
// manuel — les CV fiscaux ne sont jamais fournis par le VIN (norme US), donc
// laissés à compléter par l'utilisateur plutôt que d'être devinés.
async function decodeVin(vin, token) {
  const data = await apiFetch("/api/vehicle/lookup", { method: "POST", token, body: { plate: vin } });
  if (data.isDemo) throw new Error("VIN non reconnu");
  const gearboxRaw = (data.boite || "").toLowerCase();
  const gearbox = gearboxRaw.includes("manual") ? "Manuelle" : gearboxRaw.includes("auto") ? "Automatique" : null;
  const result = {
    brand: data.marque || "",
    model: data.modele || "",
    motorisation: data.cylindree ? `${data.cylindree}L ${data.puissanceCh ? data.puissanceCh + "ch" : ""}`.trim() : "",
    fuel: /diesel/i.test(data.carburant || "") ? "Diesel" : /hybrid/i.test(data.carburant || "") ? "Hybride" : /electric/i.test(data.carburant || "") ? "Électrique" : "Essence",
    power: Number(data.puissanceCh) || "",
    fiscalPower: "",
    year: Number(data.annee) || "",
  };
  // Ne pas écraser la boîte par défaut du formulaire si le VIN ne la précise pas.
  if (gearbox) result.gearbox = gearbox;
  return result;
}

const LEGAL_DOCS = {
  mentions: {
    title: "Mentions légales",
    text: `Éditeur : Malik KERRACHE — Auto-entrepreneur / Micro-entreprise.
SIRET : 981 641 970 00018.

AutoProfit fournit des estimations de valeur de marché et de rentabilité à titre indicatif. Ces estimations ne constituent ni un avis d'expert automobile, ni une garantie de résultat. L'utilisateur reste seul responsable de ses décisions d'achat ou de revente de véhicules.

Contact : [e-mail de contact à compléter].`,
  },
  cgu: {
    title: "Conditions Générales d'Utilisation",
    text: `AutoProfit permet d'analyser un véhicule d'occasion (détails saisis manuellement ou VIN) pour obtenir une estimation de valeur de marché, un verdict IA sur la qualité du deal, un prix d'achat maximum conseillé et une marge potentielle. Ces estimations sont indicatives.

L'accès aux fonctionnalités d'analyse nécessite un compte (e-mail + mot de passe). Formule gratuite : 3 analyses par semaine. Formule Premium : analyses illimitées.

L'utilisateur s'engage à ne pas contourner les limitations techniques et à ne pas réutiliser les données générées à des fins commerciales sans autorisation. Le compte peut être suspendu en cas de non-respect de ces règles.`,
  },
  cgv: {
    title: "Conditions Générales de Vente",
    text: `Abonnement AutoProfit Premium : 39,99 € TTC par mois, sans engagement de durée, avec reconduction automatique.

Le paiement est traité via le système d'achat intégré d'Apple (In-App Purchase) — AutoProfit n'a accès à aucune donnée bancaire.

Résiliation possible à tout moment depuis les réglages du compte Apple, effective à la fin de la période déjà payée. Droit de rétractation de 14 jours conformément à l'article L.221-21 du Code de la consommation, sauf consentement exprès au commencement immédiat de la prestation.`,
  },
  privacy: {
    title: "Politique de confidentialité",
    text: `Données collectées : e-mail, mot de passe (haché, jamais en clair), détails du véhicule saisis (marque, modèle, VIN le cas échéant), kilométrage, historique des analyses, statut d'abonnement.

Un VIN identifie un véhicule précis et peut, combiné à d'autres informations, permettre de remonter indirectement à son titulaire : il est traité comme une donnée à caractère personnel au sens du RGPD.

Ces données sont conservées tant que le compte est actif. Aucune vente ni partage à des fins publicitaires. Les données de paiement sont traitées exclusivement par Apple.

Vous disposez d'un droit d'accès, de rectification, d'effacement et de portabilité de vos données, exerçable depuis le compte ou par e-mail. Vous pouvez également saisir la CNIL (www.cnil.fr).`,
  },
};

function LegalDocScreen({ docKey, go }) {
  const doc = LEGAL_DOCS[docKey];
  if (!doc) return null;
  return (
    <div className="pb-24">
      <Header title={doc.title} onBack={() => go("profile")} />
      <div className="px-5">
        <Card className="p-5">
          <p className="text-[13px] leading-relaxed whitespace-pre-line" style={{ color: "#C7D1CC" }}>{doc.text}</p>
        </Card>
      </div>
    </div>
  );
}

function currency(n) {
  return Math.round(n).toLocaleString("fr-FR") + " €";
}

// ---------------------------------------------------------------------------
// ESTIMATION IA — analyse réelle d'un problème mécanique via l'API Claude.
// L'IA détermine elle-même la gravité et donne une fourchette de réparation
// réaliste + une décote de risque, adaptées au véhicule concerné. Si l'appel
// échoue, on retombe sur une estimation par défaut pour ne jamais bloquer
// l'utilisateur.
// ---------------------------------------------------------------------------

// Pour un problème saisi librement par l'utilisateur : l'IA lit la description
// et détermine elle-même la gravité (pas de bouton pré-sélectionné par défaut).
// L'appel réel à Claude se fait côté backend (clé API jamais exposée dans l'app).
async function getAiEstimateFromDescription(description, vehicle, token) {
  try {
    if (!token) throw new Error("Non authentifié");
    const data = await apiFetch("/api/vehicle/problem-estimate", {
      method: "POST",
      token,
      body: { description, vehicle },
    });
    return { ...data, source: "ai" };
  } catch (e) {
    // Fallback : gravité modérée par défaut si l'IA échoue ou si non connecté
    const sev = SEVERITY_LEVELS[1];
    return {
      minCost: 300, maxCost: 900, riskPct: sev.riskPct,
      explanation: "Estimation par défaut (l'analyse IA n'a pas pu être obtenue) — ajuste la gravité manuellement si besoin.",
      severityKey: sev.key,
      source: "fallback",
    };
  }
}

// Pour une photo de dégât : l'IA identifie la pièce concernée, la gravité et
// une fourchette de réparation réaliste. Appel backend (vision), jamais direct.
async function getPhotoDamageEstimate(imageBase64, mediaType, vehicle, token) {
  if (!token) throw new Error("Non authentifié");
  return apiFetch("/api/vehicle/photo-estimate", {
    method: "POST",
    token,
    body: { imageBase64, mediaType, vehicle },
  });
}

// ---------------------------------------------------------------------------
// AUTHENTIFICATION & ADMIN — stockage persistant (survit à la fermeture de l'app)
//
// IMPORTANT : ceci est un mode démonstration réaliste, pas une vraie
// infrastructure de production. Les mots de passe sont hashés (SHA-256, pas
// stocké en clair) mais sans salage ni limitation de tentatives — pour un
// vrai lancement, il faudra un backend d'authentification dédié (ex: Supabase
// Auth, Firebase Auth, ou ton propre serveur) avec de vraies protections.
//
// Le registre des comptes et la messagerie sont stockés en "shared" (visible
// par tous les utilisateurs de cet artefact) — c'est nécessaire pour qu'un
// compte admin puisse voir la liste des autres utilisateurs et leurs
// messages. ATTENTION : ce mode démo n'a pas de vraie séparation de droits
// (row-level security) — n'importe quel utilisateur technique pourrait lire
// ce registre partagé, pas seulement l'admin. En production, ce contrôle
// d'accès doit être appliqué côté serveur (ex: policies Supabase RLS).
// ---------------------------------------------------------------------------

// IMPORTANT : AutoProfit est maintenant connecté à un vrai backend en ligne
// (Node.js/Express + PostgreSQL sur Supabase, hébergé sur Render). Les
// comptes, mots de passe (hashés côté serveur avec bcrypt), quota, messages
// et analyses sont réellement stockés en base de données — ce n'est plus
// une démonstration locale à l'artefact.
// ---------------------------------------------------------------------------

const API_BASE = "https://autoprofit-backend.onrender.com";
const STORAGE_AVAILABLE = typeof window !== "undefined" && !!window.storage;
const ADMIN_EMAIL = "malikbenlebna7@gmail.com";

// Le jeton de connexion (JWT) reste stocké localement sur l'appareil — il
// prouve qui est connecté, mais ne contient aucune donnée sensible en clair.
async function loadToken() {
  if (!STORAGE_AVAILABLE) return null;
  try {
    const res = await window.storage.get("autoprofit:token", false);
    return res ? JSON.parse(res.value).token : null;
  } catch { return null; }
}
async function saveToken(token) {
  if (!STORAGE_AVAILABLE) return;
  try { await window.storage.set("autoprofit:token", JSON.stringify({ token }), false); } catch {}
}
async function clearToken() {
  if (!STORAGE_AVAILABLE) return;
  try { await window.storage.delete("autoprofit:token", false); } catch {}
}

// Petit helper pour appeler le backend, avec le jeton d'authentification si présent
async function apiFetch(path, { method = "GET", body, token } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Erreur serveur.");
  return data;
}

// ---------- Calcul de rentabilité ----------
function computeValuation(vehicle, repairCosts, riskDiscount) {
  const beforeProblems = vehicle.market;
  const floor = beforeProblems * 0.3;
  const adjustedValue = Math.round(Math.max(floor, beforeProblems - repairCosts - riskDiscount));
  return { beforeProblems, adjustedValue };
}

function suggestedMaxPurchase(resaleEstimate, repairCosts) {
  const targetMargin = Math.round(resaleEstimate * 0.12);
  const raw = resaleEstimate - repairCosts - targetMargin;
  return Math.max(0, Math.round(raw / 500) * 500);
}

function computeFinal(purchasePrice, repairCosts, repairCostsMin, repairCostsMax, resaleEstimate, resaleMin, resaleMax, cgTotal) {
  const costTotal = purchasePrice + repairCosts + cgTotal;
  const margin = resaleEstimate - costTotal;
  // Fourchette de marge : meilleur cas (revente haute, réparations basses) / pire cas (revente basse, réparations hautes)
  const marginMax = resaleMax - (purchasePrice + repairCostsMin + cgTotal);
  const marginMin = resaleMin - (purchasePrice + repairCostsMax + cgTotal);
  const roi = costTotal > 0 ? (margin / costTotal) * 100 : 0;
  let score = Math.round(50 + roi * 2.2);
  score = Math.max(0, Math.min(100, score));
  let verdict = "negotiate";
  if (score >= 85) verdict = "excellent";
  else if (score >= 70) verdict = "good";
  else if (score >= 45) verdict = "negotiate";
  else if (score >= 25) verdict = "low";
  else verdict = "avoid";
  return { costTotal, margin, marginMin, marginMax, roi, score, verdict };
}

const VERDICT_META = {
  excellent: { label: "EXCELLENTE AFFAIRE", color: "#22D67A", Icon: CheckCircle2, bg: "rgba(34,214,122,0.12)",
    text: (m) => `L'affaire est très favorable : la marge potentielle de ${currency(m.margin)} dépasse largement ce qu'on attend pour ce type de véhicule.` },
  good: { label: "BONNE AFFAIRE", color: "#3FBF7F", Icon: CheckCircle2, bg: "rgba(63,191,127,0.12)",
    text: (m) => `Malgré les frais et réparations estimés, une marge potentielle d'environ ${currency(m.margin)} reste possible à ce prix d'achat.` },
  negotiate: { label: "À NÉGOCIER", color: "#E8A33D", Icon: AlertTriangle, bg: "rgba(232,163,61,0.12)",
    text: (m) => `La marge reste correcte (${currency(m.margin)}), mais négocier le prix d'achat améliorerait nettement la rentabilité.` },
  low: { label: "FAIBLE MARGE", color: "#E8763D", Icon: AlertTriangle, bg: "rgba(232,118,61,0.12)",
    text: () => `Les réparations estimées et la décote liée au risque réduisent fortement la marge potentielle. Le prix d'achat demandé est trop élevé.` },
  avoid: { label: "À ÉVITER", color: "#E5484D", Icon: XCircle, bg: "rgba(229,72,77,0.12)",
    text: () => `À ce prix d'achat, la marge ne couvre pas le risque pris. Baisse fortement le prix ou passe ton chemin.` },
};

// Verdict IA (achat-revente) — distinct de VERDICT_META ci-dessus qui reflète
// uniquement le calcul de marge. Celui-ci ajoute l'avis qualitatif de l'IA :
// qualité du deal, facilité de revente du modèle, risques de fiabilité connus.
const AI_VERDICT_META = {
  excellente_affaire: { label: "Excellente affaire", color: "#22D67A" },
  bonne_affaire: { label: "Bonne affaire", color: "#3FBF7F" },
  affaire_correcte: { label: "Affaire correcte", color: "#8CC9A6" },
  a_negocier: { label: "À négocier", color: "#E8A33D" },
  a_eviter: { label: "À éviter", color: "#E5484D" },
};
const RESALE_META = { elevee: { label: "Élevée", color: "#3FBF7F" }, moyenne: { label: "Moyenne", color: "#E8A33D" }, faible: { label: "Faible", color: "#E5484D" } };
const RISK_META = { faible: { label: "Faible", color: "#3FBF7F" }, modere: { label: "Modéré", color: "#E8A33D" }, eleve: { label: "Élevé", color: "#E5484D" } };

// ---------- Shared bits ----------
const Card = ({ children, className = "", style = {}, onClick }) => (
  <div onClick={onClick} className={`rounded-2xl ${className}`} style={{ background: "#141C18", border: "1px solid #232E29", ...style }}>{children}</div>
);

const PrimaryButton = ({ children, onClick, className = "", disabled, style = {} }) => (
  <button onClick={onClick} disabled={disabled}
    className={`w-full rounded-xl py-3.5 font-semibold text-[15px] transition-all active:scale-[0.98] disabled:opacity-40 ${className}`}
    style={{ background: "linear-gradient(135deg, #3FBF7F, #2E9963)", color: "#08120D", ...style }}>
    {children}
  </button>
);

const GhostButton = ({ children, onClick, className = "" }) => (
  <button onClick={onClick}
    className={`w-full rounded-xl py-3.5 font-semibold text-[15px] transition-all active:scale-[0.98] ${className}`}
    style={{ background: "#1B2420", color: "#EDF2EF", border: "1px solid #2B372F" }}>
    {children}
  </button>
);

function Spinner({ size = 16, color = "#08120D" }) {
  return (
    <span
      style={{
        display: "inline-block",
        width: size,
        height: size,
        border: `2px solid ${color}33`,
        borderTopColor: color,
        borderRadius: "50%",
        animation: "ap-spin 0.7s linear infinite",
      }}
    />
  );
}

// Écran de chargement plein cadre, réutilisable partout où une requête prend
// du temps (identification véhicule, prix du marché...). Les messages
// défilent pour que l'attente reste lisible sur les requêtes plus longues.
function LoadingScreen({ title = "Analyse en cours...", messages }) {
  const [msgIndex, setMsgIndex] = useState(0);
  useEffect(() => {
    if (!messages || messages.length < 2) return;
    const id = setInterval(() => setMsgIndex((i) => (i + 1) % messages.length), 1800);
    return () => clearInterval(id);
  }, [messages]);

  return (
    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center px-10 text-center" style={{ background: "#0B0F0D" }}>
      <Spinner size={40} color="#3FBF7F" />
      <p className="ap-display text-[16px] font-semibold mt-5" style={{ color: "#EDF2EF" }}>{title}</p>
      {messages && (
        <p className="text-[13px] mt-2" style={{ color: "#8C9992", animation: "ap-pulse 1.4s ease-in-out infinite" }}>
          {messages[msgIndex]}
        </p>
      )}
    </div>
  );
}

function DemoBanner({ text }) {
  return (
    <div className="flex items-start gap-2.5 rounded-xl px-4 py-3" style={{ background: "rgba(212,169,74,0.1)", border: "1px solid rgba(212,169,74,0.35)" }}>
      <Info size={15} color="#D4A94A" className="shrink-0 mt-0.5" />
      <p className="text-[12px] leading-snug" style={{ color: "#E8D7A8" }}>{text}</p>
    </div>
  );
}

function QuotaBadge({ isPremium, used }) {
  if (isPremium) {
    return (
      <div className="flex items-center gap-1.5 rounded-full px-3 py-1.5 w-fit" style={{ background: "rgba(63,191,127,0.12)" }}>
        <Sparkles size={12} color="#3FBF7F" />
        <span className="text-[11px] font-semibold" style={{ color: "#3FBF7F" }}>Analyses illimitées</span>
      </div>
    );
  }
  const reached = used >= FREE_WEEKLY_LIMIT;
  return (
    <div className="flex items-center gap-1.5 rounded-full px-3 py-1.5 w-fit" style={{ background: reached ? "rgba(229,72,77,0.12)" : "rgba(140,153,146,0.12)" }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: reached ? "#E5484D" : "#8C9992" }} />
      <span className="text-[11px] font-semibold" style={{ color: reached ? "#E5484D" : "#8C9992" }}>
        {Math.min(used, FREE_WEEKLY_LIMIT)} / {FREE_WEEKLY_LIMIT} analyses utilisées cette semaine
      </span>
    </div>
  );
}

function Header({ title, onBack }) {
  return (
    <div className="flex items-center gap-3 px-5 pt-6 pb-4">
      {onBack && <button onClick={onBack} className="p-1 -ml-1"><ArrowLeft size={20} color="#EDF2EF" /></button>}
      <h1 className="ap-display text-[19px] font-semibold" style={{ color: "#EDF2EF" }}>{title}</h1>
    </div>
  );
}

function BottomNav({ screen, go, isAdmin }) {
  const items = [
    { key: "home", label: "Accueil", Icon: HomeIcon },
    { key: "scan", label: "Scanner", Icon: ScanLine },
    { key: "history", label: "Analyses", Icon: HistoryIcon },
    { key: "profile", label: "Profil", Icon: User },
    ...(isAdmin ? [{ key: "admin", label: "Admin", Icon: ShieldCheck }] : []),
  ];
  return (
    <div className="fixed bottom-0 left-0 right-0 flex justify-around py-2.5 px-2" style={{ background: "rgba(11,15,13,0.92)", backdropFilter: "blur(10px)", borderTop: "1px solid #1E2822" }}>
      {items.map(({ key, label, Icon }) => {
        const active = screen === key;
        return (
          <button key={key} onClick={() => go(key)} className="flex flex-col items-center gap-1 px-3 py-1">
            <Icon size={20} color={active ? "#3FBF7F" : "#6B776F"} strokeWidth={active ? 2.4 : 2} />
            <span style={{ fontSize: 11, color: active ? "#3FBF7F" : "#6B776F", fontWeight: active ? 600 : 500 }}>{label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ---------- Screens ----------
function HomeScreen({ go, isPremium, weeklyUsed }) {
  return (
    <div className="pb-24">
      <div className="px-6 pt-14 pb-10" style={{ background: "radial-gradient(120% 100% at 50% 0%, #16211B 0%, #0B0F0D 65%)" }}>
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: "linear-gradient(135deg,#3FBF7F,#2E9963)" }}>
              <TrendingUp size={18} color="#08120D" strokeWidth={2.5} />
            </div>
            <span className="ap-display text-[18px] font-semibold" style={{ color: "#EDF2EF" }}>AutoProfit</span>
          </div>
          <QuotaBadge isPremium={isPremium} used={weeklyUsed} />
        </div>

        <h1 className="ap-display text-[32px] leading-[1.15] font-semibold mb-4" style={{ color: "#EDF2EF" }}>
          Ton prochain achat, <span style={{ color: "#3FBF7F" }}>calculé</span> avant d'être signé.
        </h1>
        <p className="text-[15px] leading-relaxed mb-8" style={{ color: "#8C9992" }}>
          Renseigne les détails d'un véhicule (ou son VIN). AutoProfit trouve sa valeur de marché, donne un verdict IA et calcule ta marge — automatiquement.
        </p>
        <PrimaryButton onClick={() => go("scan")}>Analyser un véhicule</PrimaryButton>
        <p className="text-[12px] text-center mt-3" style={{ color: "#6B776F" }}>
          Compte gratuit : 3 analyses/semaine · <span style={{ color: "#D4A94A" }}>Premium : illimité</span>
        </p>
      </div>

      <div className="px-6 pt-8 space-y-4">
        {[
          { n: "01", t: "Identifier", d: "Détails du véhicule ou VIN", Icon: ScanLine },
          { n: "02", t: "Analyser", d: "Cote réelle du marché + verdict IA", Icon: Gauge },
          { n: "03", t: "Décider", d: "Prix d'achat maximum + marge potentielle", Icon: TrendingUp },
        ].map((s) => (
          <Card key={s.n} className="p-4 flex items-center gap-4">
            <div className="ap-display text-[13px] font-semibold w-8" style={{ color: "#3FBF7F" }}>{s.n}</div>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: "#1B2420" }}>
              <s.Icon size={18} color="#3FBF7F" />
            </div>
            <div className="flex-1">
              <div className="text-[15px] font-semibold" style={{ color: "#EDF2EF" }}>{s.t}</div>
              <div className="text-[13px]" style={{ color: "#8C9992" }}>{s.d}</div>
            </div>
          </Card>
        ))}
        <button onClick={() => go("premium")} className="w-full mt-2">
          <Card className="p-4 flex items-center gap-3" style={{ borderColor: "#3FBF7F55" }}>
            <Sparkles size={18} color="#D4A94A" />
            <div className="flex-1 text-left">
              <div className="text-[14px] font-semibold" style={{ color: "#EDF2EF" }}>AutoProfit Premium</div>
              <div className="text-[12px]" style={{ color: "#8C9992" }}>Analyses illimitées · 39,99€/mois</div>
            </div>
            <ChevronRight size={18} color="#6B776F" />
          </Card>
        </button>
      </div>
    </div>
  );
}

const EMPTY_VEHICLE_FORM = { brand: "", model: "", motorisation: "", fuel: "Essence", power: "", fiscalPower: "", year: "", gearbox: "Manuelle" };

// Marques les plus courantes sur le marché français de l'occasion — liste
// réelle et curatée (pas la liste mondiale NHTSA de ~10 000 constructeurs,
// trop bruitée pour une saisie rapide sur le terrain).
const COMMON_BRANDS = [
  "Renault", "Peugeot", "Citroën", "Volkswagen", "BMW", "Mercedes-Benz", "Audi", "Ford", "Toyota",
  "Nissan", "Opel", "Fiat", "Seat", "Škoda", "Dacia", "Hyundai", "Kia", "Volvo", "Mini", "Mazda",
  "Honda", "Suzuki", "Jeep", "Land Rover", "Jaguar", "Porsche", "Tesla", "Alfa Romeo", "Mitsubishi",
  "Subaru", "Lexus", "DS", "Smart", "Abarth", "Chevrolet", "Chrysler", "Alpine", "Cupra",
];

// Sigles moteur qui identifient sans ambiguïté un diesel chez les
// constructeurs présents sur le marché français — évite à l'utilisateur de
// resaisir une info déjà contenue dans la motorisation (ex: "1.5 dCi 90").
const DIESEL_MOTOR_HINTS = /\b(dci|hdi|bluehdi|tdi|cdi|crdi|jtd|multijet|d-4d|dtec|cdti|tdci|dti)\b/i;

function inferFuelFromMotorisation(text) {
  if (!text) return null;
  return DIESEL_MOTOR_HINTS.test(text) ? "Diesel" : null;
}

// Estimation des CV fiscaux à partir de la puissance (ch) : la formule
// officielle dépend aussi du CO2 (indisponible ici), donc cette table par
// palier de puissance est une ESTIMATION usuelle, pas une valeur garantie —
// le champ reste éditable pour que l'utilisateur corrige avec sa carte grise.
function estimateFiscalPower(powerCh) {
  const p = Number(powerCh);
  if (!p || p <= 0) return "";
  if (p < 60) return 3;
  if (p < 90) return 4;
  if (p < 110) return 5;
  if (p < 140) return 6;
  if (p < 170) return 7;
  if (p < 200) return 9;
  if (p < 250) return 10;
  return 12;
}

// Modèles réels les plus vendus en occasion en France, par marque. La base
// NHTSA (déjà utilisée pour le décodage VIN) ne couvre que le marché
// américain — elle ne connaît ni la Clio, ni la 208, ni la Golf — donc
// inutilisable ici. Cette liste reste une vraie nomenclature de modèles
// commercialisés, pas des noms inventés.
const BRAND_MODELS = {
  Renault: ["Clio", "Captur", "Megane", "Scenic", "Twingo", "Kadjar", "Talisman", "Zoe", "Austral", "Arkana"],
  Peugeot: ["208", "2008", "308", "3008", "5008", "508", "108", "Rifter", "Partner"],
  "Citroën": ["C3", "C3 Aircross", "C4", "C4 Picasso", "C5 Aircross", "Berlingo", "C1", "C5X"],
  Volkswagen: ["Golf", "Polo", "Tiguan", "Passat", "T-Roc", "T-Cross", "Touran", "Touareg", "ID.3", "ID.4"],
  BMW: ["Série 1", "Série 2", "Série 3", "Série 4", "Série 5", "X1", "X2", "X3", "X5", "X6"],
  "Mercedes-Benz": ["Classe A", "Classe B", "Classe C", "Classe E", "GLA", "GLB", "GLC", "GLE", "CLA"],
  Audi: ["A1", "A3", "A4", "A5", "A6", "Q2", "Q3", "Q5", "Q7", "TT"],
  Ford: ["Fiesta", "Focus", "Puma", "Kuga", "Ecosport", "Mondeo", "Ka+"],
  Toyota: ["Yaris", "Corolla", "C-HR", "RAV4", "Aygo", "Yaris Cross", "Prius"],
  Nissan: ["Qashqai", "Juke", "Micra", "X-Trail", "Leaf", "Note"],
  Opel: ["Corsa", "Astra", "Crossland", "Grandland", "Mokka", "Insignia"],
  Fiat: ["500", "Panda", "Tipo", "500X", "500L"],
  Seat: ["Ibiza", "Leon", "Arona", "Ateca", "Tarraco"],
  "Škoda": ["Fabia", "Octavia", "Kamiq", "Karoq", "Scala", "Superb"],
  Dacia: ["Sandero", "Duster", "Spring", "Jogger", "Logan"],
  Hyundai: ["i10", "i20", "i30", "Tucson", "Kona", "Santa Fe"],
  Kia: ["Picanto", "Rio", "Ceed", "Sportage", "Niro", "Sorento"],
  Volvo: ["XC40", "XC60", "XC90", "V60", "V90", "S60"],
  Mini: ["Cooper", "Countryman", "Clubman"],
  Mazda: ["CX-3", "CX-5", "CX-30", "MX-5", "Mazda2", "Mazda3"],
  Honda: ["Civic", "CR-V", "Jazz", "HR-V"],
  Suzuki: ["Swift", "Vitara", "S-Cross", "Ignis"],
  Jeep: ["Compass", "Renegade", "Cherokee"],
  Tesla: ["Model 3", "Model Y", "Model S", "Model X"],
};

function suggestModels(brand, query) {
  const list = BRAND_MODELS[brand] || [];
  const q = query.trim().toLowerCase();
  return list.filter((m) => m.toLowerCase().includes(q)).slice(0, 6);
}

function ScanScreen({ go, onAnalyze, isPremium, weeklyUsed, limitReached, authUser, authLoading, authToken }) {
  const [tab, setTab] = useState("manual");
  const [form, setForm] = useState(EMPTY_VEHICLE_FORM);
  const [km, setKm] = useState("");
  const [vin, setVin] = useState("");
  const [vinLoading, setVinLoading] = useState(false);
  const [vinError, setVinError] = useState("");
  const [vinFilled, setVinFilled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [brandOpen, setBrandOpen] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);

  // Déductions automatiques à partir de données réelles/déterministes :
  // motorisation -> carburant (sigle diesel sans ambiguïté), puissance -> CV
  // fiscaux (estimation par palier, corrigible). Jamais de faux positif si
  // aucune règle ne s'applique — le champ reste alors tel quel.
  // Tant que l'utilisateur n'a pas lui-même modifié les CV fiscaux, l'estimation
  // continue de suivre la puissance saisie (sinon elle se figerait dès le
  // premier chiffre tapé, ex: "8" puis "86" resteraient bloqués sur l'estimation de "8").
  const fiscalPowerAuto = useRef(true);

  const setField = (key, val) => {
    setForm((prev) => {
      const next = { ...prev, [key]: val };
      if (key === "motorisation") {
        const inferredFuel = inferFuelFromMotorisation(val);
        if (inferredFuel) next.fuel = inferredFuel;
      }
      if (key === "power" && fiscalPowerAuto.current) {
        next.fiscalPower = estimateFiscalPower(val);
      }
      if (key === "fiscalPower") {
        fiscalPowerAuto.current = false;
      }
      if (key === "brand" && val !== prev.brand) {
        next.model = "";
      }
      return next;
    });
  };

  const brandSuggestions = COMMON_BRANDS.filter((b) => b.toLowerCase().includes(form.brand.trim().toLowerCase())).slice(0, 6);
  const modelSuggestions = suggestModels(form.brand, form.model);

  const decode = async () => {
    if (!vin.trim()) return;
    setVinLoading(true);
    setVinError("");
    try {
      const decoded = await decodeVin(vin.trim(), authToken);
      if (decoded.power && fiscalPowerAuto.current) decoded.fiscalPower = estimateFiscalPower(decoded.power);
      setForm((prev) => ({ ...prev, ...decoded }));
      setVinFilled(true);
      setTab("manual");
    } catch (e) {
      setVinError("VIN non reconnu — saisis les détails manuellement ci-contre.");
    } finally {
      setVinLoading(false);
    }
  };

  const formValid = form.brand.trim() && form.model.trim() && Number(form.power) > 0 && Number(form.fiscalPower) > 0 && Number(form.year) > 1980 && Number(km) > 0;

  const runAnalyze = async () => {
    setLoading(true);
    // onAnalyze navigue lui-même vers l'écran de résultat une fois terminé —
    // l'écran de chargement reste donc affiché exactement le temps réel des
    // requêtes (recherche de comparables réels), pas une durée fixe ici.
    await onAnalyze({
      brand: form.brand.trim(), model: form.model.trim(), motorisation: form.motorisation.trim(),
      fuel: form.fuel, power: Number(form.power), fiscalPower: Number(form.fiscalPower),
      year: Number(form.year), gearbox: form.gearbox, km: Number(km),
    });
    setLoading(false);
  };

  useEffect(() => {
    if (!authLoading && !authUser) go("profile");
  }, [authLoading, authUser]);

  if (authLoading || !authUser) {
    return (
      <div className="pb-24">
        <Header title="Analyse ton véhicule" onBack={() => go("home")} />
        <div className="px-5"><Card className="p-8 text-center"><p className="text-[13px]" style={{ color: "#8C9992" }}>Chargement...</p></Card></div>
      </div>
    );
  }

  if (limitReached) {
    return (
      <div className="pb-24">
        <Header title="Analyse ton véhicule" onBack={() => go("home")} />
        <div className="px-5 space-y-4">
          <Card className="p-6 text-center">
            <AlertTriangle size={24} color="#E8A33D" className="mx-auto mb-3" />
            <p className="text-[15px] font-semibold mb-1" style={{ color: "#EDF2EF" }}>Tu as utilisé tes 3 analyses gratuites cette semaine.</p>
            <p className="text-[13px] mb-5" style={{ color: "#8C9992" }}>
              Ton compte gratuit (<span style={{ color: "#EDF2EF" }}>{authUser}</span>) revient à 3 nouvelles analyses la semaine prochaine.
              Passe <span style={{ color: "#D4A94A", fontWeight: 600 }}>Premium</span> pour des analyses illimitées, sans attendre.
            </p>
            <PrimaryButton onClick={() => go("premium")}>Passer à AutoProfit Premium — 39,99 €/mois</PrimaryButton>
          </Card>
        </div>
      </div>
    );
  }

  const inputStyle = { background: "#141C18", border: "1px solid #232E29", color: "#EDF2EF" };
  const fieldClass = "w-full rounded-xl px-3.5 py-3 text-[14px] outline-none appearance-none";

  return (
    <div className="pb-24">
      {loading && (
        <LoadingScreen
          title="Analyse en cours..."
          messages={["Recherche d'annonces comparables...", "Calcul de la cote du véhicule...", "Analyse du potentiel de revente..."]}
        />
      )}
      <Header title="Analyse ton véhicule" onBack={() => go("home")} />
      <div className="px-5 space-y-5">
        <QuotaBadge isPremium={isPremium} used={weeklyUsed} />

        <div className="flex rounded-xl p-1" style={{ background: "#141C18", border: "1px solid #232E29" }}>
          {[["manual", "Détails du véhicule"], ["vin", "VIN"]].map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)}
              className="flex-1 py-2 rounded-lg text-[13px] font-medium"
              style={{ background: tab === k ? "#1B2420" : "transparent", color: tab === k ? "#3FBF7F" : "#8C9992" }}>
              {label}
            </button>
          ))}
        </div>

        {tab === "vin" ? (
          <Card className="p-4 space-y-3">
            <label className="text-[13px] font-medium block" style={{ color: "#8C9992" }}>Numéro VIN (17 caractères)</label>
            <input value={vin} onChange={(e) => setVin(e.target.value.toUpperCase())} placeholder="VF3XXXXXXXXXXXXXX"
              className={fieldClass} style={inputStyle} />
            <PrimaryButton onClick={decode} disabled={!vin.trim() || vinLoading}>
              {vinLoading ? <span className="flex items-center justify-center gap-2"><Spinner /> Décodage...</span> : "Décoder le VIN"}
            </PrimaryButton>
            {vinError && <p className="text-[11px]" style={{ color: "#E5484D" }}>{vinError}</p>}
            <p className="text-[11px] leading-snug" style={{ color: "#6B776F" }}>
              Décodage gratuit via la base officielle NHTSA. Les champs de l'onglet "Détails du véhicule" seront pré-remplis — vérifie-les (les CV fiscaux ne sont jamais fournis par le VIN).
            </p>
          </Card>
        ) : (
          <Card className="p-4 space-y-3">
            {vinFilled && (
              <p className="text-[11px] rounded-lg px-2.5 py-2" style={{ color: "#3FBF7F", background: "rgba(63,191,127,0.1)" }}>
                Champs pré-remplis depuis le VIN — vérifie-les, surtout les CV fiscaux.
              </p>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="relative">
                <label className="text-[11px] font-medium block mb-1" style={{ color: "#8C9992" }}>Marque</label>
                <input value={form.brand} onChange={(e) => setField("brand", e.target.value)}
                  onFocus={() => setBrandOpen(true)} onBlur={() => setTimeout(() => setBrandOpen(false), 150)}
                  placeholder="Renault" className={fieldClass} style={inputStyle} autoComplete="off" />
                {brandOpen && form.brand.trim() && brandSuggestions.length > 0 && (
                  <div className="absolute left-0 right-0 mt-1 rounded-xl overflow-hidden z-10" style={{ background: "#1B2420", border: "1px solid #2B372F" }}>
                    {brandSuggestions.map((b) => (
                      <button key={b} type="button" onMouseDown={() => { setField("brand", b); setBrandOpen(false); }}
                        className="w-full text-left px-3.5 py-2 text-[13px]" style={{ color: "#EDF2EF" }}>
                        {b}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="relative">
                <label className="text-[11px] font-medium block mb-1" style={{ color: "#8C9992" }}>Modèle</label>
                <input value={form.model} onChange={(e) => setField("model", e.target.value)}
                  onFocus={() => setModelOpen(true)} onBlur={() => setTimeout(() => setModelOpen(false), 150)}
                  placeholder="Clio" className={fieldClass} style={inputStyle} autoComplete="off" />
                {modelOpen && modelSuggestions.length > 0 && (
                  <div className="absolute left-0 right-0 mt-1 rounded-xl overflow-hidden z-10" style={{ background: "#1B2420", border: "1px solid #2B372F" }}>
                    {modelSuggestions.map((m) => (
                      <button key={m} type="button" onMouseDown={() => { setField("model", m); setModelOpen(false); }}
                        className="w-full text-left px-3.5 py-2 text-[13px]" style={{ color: "#EDF2EF" }}>
                        {m}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <p className="text-[10px] -mt-1.5" style={{ color: "#6B776F" }}>Sans le numéro de génération (ex: "Clio", pas "Clio 5") — ça aide à trouver de vraies annonces comparables.</p>
            <div>
              <label className="text-[11px] font-medium block mb-1" style={{ color: "#8C9992" }}>Motorisation</label>
              <input value={form.motorisation} onChange={(e) => setField("motorisation", e.target.value)} placeholder="1.5 dCi 100" className={fieldClass} style={inputStyle} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-medium block mb-1" style={{ color: "#8C9992" }}>Carburant</label>
                <select value={form.fuel} onChange={(e) => setField("fuel", e.target.value)} className={fieldClass} style={inputStyle}>
                  {["Essence", "Diesel", "Hybride", "Électrique"].map((f) => (<option key={f} value={f}>{f}</option>))}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-medium block mb-1" style={{ color: "#8C9992" }}>Puissance (ch)</label>
                <input type="number" inputMode="numeric" value={form.power} onChange={(e) => setField("power", e.target.value)} placeholder="100" className={fieldClass} style={inputStyle} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-medium block mb-1" style={{ color: "#8C9992" }}>
                  CV fiscaux {form.power && fiscalPowerAuto.current && <span style={{ color: "#6B776F", fontWeight: 400 }}>(estimé)</span>}
                </label>
                <input type="number" inputMode="numeric" value={form.fiscalPower} onChange={(e) => setField("fiscalPower", e.target.value)} placeholder="4" className={fieldClass} style={inputStyle} />
              </div>
              <div>
                <label className="text-[11px] font-medium block mb-1" style={{ color: "#8C9992" }}>Année</label>
                <input type="number" inputMode="numeric" value={form.year} onChange={(e) => setField("year", e.target.value)} placeholder="2021" className={fieldClass} style={inputStyle} />
              </div>
            </div>
            <div>
              <label className="text-[11px] font-medium block mb-1" style={{ color: "#8C9992" }}>Boîte</label>
              <select value={form.gearbox} onChange={(e) => setField("gearbox", e.target.value)} className={fieldClass} style={inputStyle}>
                {["Manuelle", "Automatique"].map((g) => (<option key={g} value={g}>{g}</option>))}
              </select>
            </div>
          </Card>
        )}

        <div>
          <label className="text-[13px] font-medium block mb-2" style={{ color: "#8C9992" }}>Kilométrage actuel <span style={{ color: "#E8A33D" }}>*</span></label>
          <input type="number" inputMode="numeric" value={km} onChange={(e) => setKm(e.target.value)} placeholder="Ex : 125000"
            className="w-full rounded-xl px-4 py-3.5 text-[15px] outline-none"
            style={{ background: "#141C18", border: `1px solid ${Number(km) > 0 ? "#232E29" : "#E8A33D66"}`, color: "#EDF2EF" }} />
          <p className="text-[11px] mt-1.5" style={{ color: "#6B776F" }}>
            Obligatoire : aucune base publique ne donne le vrai kilométrage à un acheteur (même HistoVec est réservé au propriétaire).
          </p>
        </div>

        <PrimaryButton onClick={runAnalyze} disabled={!formValid || loading}>
          {formValid ? "Analyser le véhicule" : "Complète les détails du véhicule"}
        </PrimaryButton>
      </div>
    </div>
  );
}

function ResultScreen({ vehicle, marketData, go, purchasePrice, setPurchasePrice, repairCosts, repairCostsMin, repairCostsMax, riskDiscount, onSave, cgRegion, setCgRegion, cgIsPro, setCgIsPro, problemsCount, problemsRepairMid, photosCount, photosRepairMid, verdict, verdictLoading, fetchVerdict }) {
  // Si un verdict est déjà présent (analyse rouverte depuis l'historique),
  // on ne relance pas l'IA automatiquement — "Recalculer" reste disponible.
  useEffect(() => { if (!verdict) fetchVerdict(); }, []);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsTab, setDetailsTab] = useState("specs");
  const [cgDetailOpen, setCgDetailOpen] = useState(false);

  const valuation = useMemo(() => computeValuation(vehicle, repairCosts, riskDiscount), [vehicle, repairCosts, riskDiscount]);

  // Revente estimée après remise en état : fixe, sous forme de fourchette (pas de saisie manuelle)
  const resaleRange = useMemo(() => {
    const min = Math.round(vehicle.market * 0.92);
    const max = Math.round(vehicle.market * 0.97);
    return { min, max, mid: Math.round((min + max) / 2) };
  }, [vehicle]);
  const resaleEstimate = resaleRange.mid;

  // Le prix max conseillé vient de l'IA (voir carte "Verdict IA", qui adapte
  // la marge cible à la revente/au risque de ce modèle précis) ; la formule
  // fixe à 12% ne sert que de repère tant que le verdict n'est pas chargé.
  const ruleBasedSuggested = useMemo(() => suggestedMaxPurchase(resaleEstimate, repairCosts), [resaleEstimate, repairCosts]);
  const suggested = verdict?.maxPurchasePrice ?? ruleBasedSuggested;

  const cgIsOld = new Date().getFullYear() - vehicle.year > 10;
  const cgIsElectric = vehicle.fuel === "Électrique";
  const carteGrise = useMemo(
    () => computeCarteGrise(vehicle.fiscalPower, cgRegion, cgIsOld, cgIsElectric, cgIsPro),
    [vehicle, cgRegion, cgIsOld, cgIsElectric, cgIsPro]
  );

  // Garde-fou anti-calcul absurde : sous 100 €, un ROI n'a plus aucun sens (peut afficher +1500 %).
  // On neutralise le calcul plutôt que d'afficher un chiffre trompeur.
  const incompleteInput = !purchasePrice || purchasePrice < 100;

  const final = useMemo(
    () => computeFinal(purchasePrice, repairCosts, repairCostsMin, repairCostsMax, resaleEstimate, resaleRange.min, resaleRange.max, carteGrise.total),
    [purchasePrice, repairCosts, repairCostsMin, repairCostsMax, resaleEstimate, resaleRange, carteGrise]
  );
  if (!marketData) return null;
  const meta = incompleteInput ? { label: "SAISIE INCOMPLÈTE", color: "#6B776F", bg: "rgba(107,119,111,0.12)", Icon: AlertTriangle } : VERDICT_META[final.verdict];
  const underAsking = purchasePrice > 0 && purchasePrice <= suggested;

  return (
    <div className="pb-44" style={{ background: "#0F1715", minHeight: "100vh" }}>
      {/* 1. HEADER COMPACT — véhicule + score/verdict intégrés, tout tient sur 2 lignes */}
      <div className="px-5 pt-5 pb-4">
        <div className="flex items-center justify-between mb-3">
          <button onClick={() => go("scan")} className="p-1 -ml-1"><ArrowLeft size={20} color="#EDF2EF" /></button>
          <button onClick={() => go("home")} className="p-1 -mr-1"><X size={20} color="#6B776F" /></button>
        </div>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[18px] font-bold truncate" style={{ color: "#EDF2EF" }}>{vehicle.name}</div>
            <div className="text-[12px]" style={{ color: "#8C9992" }}>{vehicle.year}</div>
          </div>
          <div className="flex items-center gap-1.5 rounded-full pl-2.5 pr-3 py-1.5 shrink-0" style={{ background: meta.bg, border: `1px solid ${meta.color}44` }}>
            <meta.Icon size={13} color={meta.color} />
            <span className="ap-display text-[13px] font-bold" style={{ color: meta.color }}>{incompleteInput ? "—" : `${final.score}/100`}</span>
            <span className="text-[11px] font-bold" style={{ color: meta.color }}>· {meta.label}</span>
          </div>
        </div>
      </div>

      <div className="px-5 space-y-3">
        {/* 2. COTE DU VÉHICULE (très gros) + MARGE NETTE (vert dynamique) */}
        <Card className="p-5 text-center" style={{ background: `linear-gradient(160deg, ${meta.color}10, #0F1715 80%)`, border: `1px solid ${meta.color}33` }}>
          <div className="text-[12px] mb-1" style={{ color: "#8C9992" }}>Cote de marché / revente estimée</div>
          <div className="ap-display text-[42px] font-bold leading-none" style={{ color: "#EDF2EF" }}>{currency(vehicle.market)}</div>
          <div className="text-[11px] mt-1.5" style={{ color: "#6B776F" }}>
            {marketData.isDemo
              ? "Estimation neutre — aucun comparable trouvé pour ce modèle."
              : `${marketData.count} comparables réels · confiance ${marketData.confidence}`}
          </div>

          <div className="mt-4 pt-4" style={{ borderTop: "1px solid #1E2822" }}>
            <div className="text-[12px] mb-1" style={{ color: "#8C9992" }}>Marge nette estimée</div>
            {incompleteInput ? (
              <div className="ap-display text-[20px] font-bold" style={{ color: "#6B776F" }}>Renseigne un prix vendeur</div>
            ) : (
              <div className="ap-display text-[26px] font-bold leading-tight" style={{ color: final.margin >= 0 ? "#22C55E" : "#E5484D" }}>
                {final.marginMin >= 0 ? "+" : ""}{currency(final.marginMin)} à {final.marginMax >= 0 ? "+" : ""}{currency(final.marginMax)}
              </div>
            )}
            <div className="text-[12px] mt-0.5 font-semibold" style={{ color: "#8C9992" }}>
              ROI {incompleteInput ? "—" : `${final.roi >= 0 ? "+" : ""}${final.roi.toFixed(0)} %`}
            </div>
          </div>
        </Card>

        {/* 3. PRIX D'ACHAT VENDEUR — champ massif, central, avec le prix max IA juste sous */}
        <Card className="p-5" style={{ border: `2px solid ${incompleteInput ? "#232E29" : underAsking ? "#22C55E55" : "#E8A33D55"}` }}>
          <label className="text-[12px] font-semibold block mb-2" style={{ color: "#8C9992" }}>PRIX DEMANDÉ (VENDEUR)</label>
          <div className="relative mb-3">
            <input type="text" inputMode="numeric" value={purchasePrice ? purchasePrice.toLocaleString("fr-FR") : ""}
              onFocus={(e) => e.target.select()}
              onChange={(e) => setPurchasePrice(Number(e.target.value.replace(/[^\d]/g, "")) || 0)}
              placeholder="0"
              className="w-full rounded-xl pl-4 pr-14 py-5 text-[36px] ap-display font-bold outline-none"
              style={{ background: "#0B0F0D", border: `1px solid ${incompleteInput ? "#E8A33D66" : "#232E29"}`, color: "#EDF2EF" }} />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[26px] font-bold" style={{ color: "#6B776F" }}>€</span>
          </div>

          <div className="flex items-center justify-between rounded-xl px-3.5 py-3" style={{ background: "#0B0F0D" }}>
            <span className="text-[12px] flex items-center gap-1.5" style={{ color: "#8C9992" }}>
              <Sparkles size={12} color="#D4A94A" /> Prix max conseillé (IA)
            </span>
            {verdictLoading ? (
              <Spinner size={14} color="#8C9992" />
            ) : (
              <span className="ap-display text-[18px] font-bold" style={{ color: underAsking ? "#22C55E" : "#E8A33D" }}>{currency(suggested)}</span>
            )}
          </div>

          {incompleteInput ? (
            <p className="text-[11px] mt-2" style={{ color: "#E8A33D" }}>Saisie incomplète — renseigne un prix réaliste (≥ 100 €) pour voir le calcul de marge.</p>
          ) : verdict ? (
            <p className="text-[11px] mt-2 leading-snug" style={{ color: "#6B776F" }}>{verdict.explanation}</p>
          ) : null}
        </Card>

        {/* 4a. ÉTAT DU VÉHICULE — discret, juste l'impact chiffré */}
        <div className="flex gap-2">
          <button onClick={() => go("damage")} className="flex-1 rounded-lg py-2 px-2 text-center" style={{ background: "#141C18", border: `1px solid ${photosCount > 0 ? "#E5484D55" : "#1E2822"}` }}>
            <span className="text-[11px]" style={{ color: "#8C9992" }}>📸 Dégâts</span>
            <span className="text-[11px] font-bold ml-1.5" style={{ color: photosCount > 0 ? "#E5484D" : "#6B776F" }}>
              {photosCount > 0 ? `-${currency(photosRepairMid)}` : "aucun"}
            </span>
          </button>
          <button onClick={() => go("problems")} className="flex-1 rounded-lg py-2 px-2 text-center" style={{ background: "#141C18", border: `1px solid ${problemsCount > 0 ? "#E5484D55" : "#1E2822"}` }}>
            <span className="text-[11px]" style={{ color: "#8C9992" }}>🔧 Problème</span>
            <span className="text-[11px] font-bold ml-1.5" style={{ color: problemsCount > 0 ? "#E5484D" : "#6B776F" }}>
              {problemsCount > 0 ? `-${currency(problemsRepairMid)}` : "aucun"}
            </span>
          </button>
        </div>

        {/* 4b. DÉTAILS & ANALYSE COMPLÈTE — tout le secondaire, replié par défaut */}
        <Card className="p-0 overflow-hidden">
          <button onClick={() => setDetailsOpen(!detailsOpen)} className="w-full flex items-center justify-between px-4 py-3">
            <span className="flex items-center gap-2 text-[11px] font-semibold" style={{ color: "#8C9992" }}>
              <FileText size={13} color="#8C9992" />
              DÉTAILS & ANALYSE COMPLÈTE
            </span>
            <ChevronRight size={15} color="#6B776F" style={{ transform: detailsOpen ? "rotate(90deg)" : "none", transition: "transform 0.15s" }} />
          </button>
          {detailsOpen && (
            <div style={{ borderTop: "1px solid #1E2822" }}>
              {/* Verdict IA complet */}
              <div className="p-4" style={{ borderBottom: "1px solid #1E2822" }}>
                <div className="text-[11px] font-semibold mb-2.5" style={{ color: "#8C9992" }}>VERDICT IA — DÉTAIL</div>
                {verdictLoading ? (
                  <p className="text-[12px] flex items-center gap-2" style={{ color: "#6B776F" }}><Spinner size={13} color="#8C9992" /> Analyse en cours...</p>
                ) : !verdict ? (
                  <div className="flex items-center justify-between">
                    <p className="text-[12px]" style={{ color: "#6B776F" }}>Analyse indisponible pour le moment.</p>
                    <button onClick={fetchVerdict} className="text-[11px] underline shrink-0" style={{ color: "#6B776F" }}>Recalculer</button>
                  </div>
                ) : (
                  <>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mb-3">
                      <span className="text-[11px]" style={{ color: "#6B776F" }}>
                        Revente : <span style={{ color: RESALE_META[verdict.resaleDesirability]?.color, fontWeight: 700 }}>{RESALE_META[verdict.resaleDesirability]?.label}</span>
                      </span>
                      <span className="text-[11px]" style={{ color: "#6B776F" }}>
                        Risque : <span style={{ color: RISK_META[verdict.riskLevel]?.color, fontWeight: 700 }}>{RISK_META[verdict.riskLevel]?.label}</span>
                      </span>
                      <button onClick={fetchVerdict} className="text-[11px] underline shrink-0 ml-auto" style={{ color: "#6B776F" }}>Recalculer</button>
                    </div>
                    {verdict.strengths?.map((s, i) => (
                      <div key={`s${i}`} className="flex items-start gap-1.5 py-0.5">
                        <CheckCircle2 size={12} color="#3FBF7F" className="shrink-0 mt-0.5" />
                        <span className="text-[12px]" style={{ color: "#8C9992" }}>{s}</span>
                      </div>
                    ))}
                    {verdict.concerns?.map((c, i) => (
                      <div key={`c${i}`} className="flex items-start gap-1.5 py-0.5">
                        <AlertTriangle size={12} color="#E8A33D" className="shrink-0 mt-0.5" />
                        <span className="text-[12px]" style={{ color: "#8C9992" }}>{c}</span>
                      </div>
                    ))}
                  </>
                )}
              </div>

              {/* Détail du calcul */}
              <div className="p-4" style={{ borderBottom: "1px solid #1E2822" }}>
                <div className="text-[11px] font-semibold mb-2.5" style={{ color: "#8C9992" }}>DÉTAIL DU CALCUL</div>
                <div className="flex items-center justify-between py-1">
                  <span className="text-[13px]" style={{ color: "#8C9992" }}>Prix de marché initial</span>
                  <span className="ap-display text-[13px]" style={{ color: "#EDF2EF" }}>{currency(vehicle.market)}</span>
                </div>
                {(repairCosts > 0 || riskDiscount > 0) && (
                  <div className="flex items-center justify-between py-1">
                    <span className="text-[13px]" style={{ color: "#8C9992" }}>Réparations + décote de risque</span>
                    <span className="ap-display text-[13px]" style={{ color: "#E5484D" }}>-{currency(repairCosts + riskDiscount)}</span>
                  </div>
                )}
                <div className="flex items-center justify-between py-1">
                  <span className="text-[13px]" style={{ color: "#8C9992" }}>Frais de carte grise</span>
                  <span className="ap-display text-[13px]" style={{ color: "#EDF2EF" }}>{currency(carteGrise.total)}</span>
                </div>
                <div className="flex items-center justify-between pl-3 py-1">
                  <select value={cgRegion} onChange={(e) => setCgRegion(e.target.value)}
                    className="rounded-lg px-2 py-1.5 text-[11px] outline-none appearance-none"
                    style={{ background: "#0B0F0D", border: "1px solid #232E29", color: "#EDF2EF" }}>
                    {CARTE_GRISE_REGIONS.map((r) => (<option key={r} value={r}>{r}</option>))}
                  </select>
                  <button onClick={() => setCgDetailOpen(!cgDetailOpen)} className="text-[10px] underline" style={{ color: "#6B776F" }}>détail</button>
                </div>
                <div className="flex items-center justify-between pl-3 py-2">
                  <span className="text-[12px] font-medium" style={{ color: "#EDF2EF" }}>Statut professionnel (achat-revente)</span>
                  <button
                    onClick={() => setCgIsPro(!cgIsPro)}
                    className="relative shrink-0"
                    style={{ width: 42, height: 24, borderRadius: 999, background: cgIsPro ? "#22C55E" : "#2B372F", transition: "background 0.2s" }}
                  >
                    <div
                      className="absolute rounded-full"
                      style={{ width: 18, height: 18, top: 3, left: cgIsPro ? 21 : 3, background: "#0B0F0D", transition: "left 0.2s" }}
                    />
                  </button>
                </div>
                {cgDetailOpen && (
                  <div className="ml-3 mb-1 rounded-xl px-3 py-2.5" style={{ background: "#0B0F0D", border: "1px solid #232E29" }}>
                    <div className="flex items-center justify-between text-[11px] py-0.5">
                      <span style={{ color: "#8C9992" }}>Taxe régionale (Y1) — {vehicle.fiscalPower} CV{cgIsPro ? " · pro" : cgIsElectric ? " · exonérée" : cgIsOld ? " · −50%, >10 ans" : ""}</span>
                      <span className="ap-display" style={{ color: "#EDF2EF" }}>{currency2(carteGrise.y1)}</span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] py-0.5">
                      <span style={{ color: "#8C9992" }}>Taxes ANTS{cgIsPro ? " — pro" : ""}</span>
                      <span className="ap-display" style={{ color: "#EDF2EF" }}>{currency2(carteGrise.antsFees)}</span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] py-0.5">
                      <span style={{ color: "#8C9992" }}>Frais de dossier {cgIsPro ? "— pro (0 €)" : "(30 € en moyenne)"}</span>
                      <span className="ap-display" style={{ color: "#EDF2EF" }}>{currency2(carteGrise.serviceFee)}</span>
                    </div>
                  </div>
                )}
                <div className="flex items-center justify-between pt-3 mt-2" style={{ borderTop: "1px solid #1E2822" }}>
                  <div>
                    <div className="text-[11px]" style={{ color: "#8C9992" }}>Coût d'achat total</div>
                    <div className="ap-display text-[17px] font-bold" style={{ color: "#EDF2EF" }}>{incompleteInput ? "—" : currency(final.costTotal)}</div>
                  </div>
                  <ChevronRight size={16} color="#6B776F" />
                  <div className="text-right">
                    <div className="text-[11px]" style={{ color: "#8C9992" }}>Revente estimée</div>
                    <div className="ap-display text-[15px] font-bold" style={{ color: "#EDF2EF" }}>{currency(resaleRange.min)} - {currency(resaleRange.max)}</div>
                  </div>
                </div>
              </div>

              {/* Fiche technique + comparables */}
              <div>
                <div className="flex" style={{ borderBottom: "1px solid #1E2822" }}>
                  <button onClick={() => setDetailsTab("specs")} className="flex-1 py-2.5 text-[12px] font-semibold"
                    style={{ color: detailsTab === "specs" ? "#22C55E" : "#6B776F", borderBottom: detailsTab === "specs" ? "2px solid #22C55E" : "2px solid transparent" }}>
                    Fiche technique
                  </button>
                  <button onClick={() => setDetailsTab("comparables")} className="flex-1 py-2.5 text-[12px] font-semibold"
                    style={{ color: detailsTab === "comparables" ? "#22C55E" : "#6B776F", borderBottom: detailsTab === "comparables" ? "2px solid #22C55E" : "2px solid transparent" }}>
                    Comparables
                  </button>
                </div>
                {detailsTab === "specs" ? (
                  <div className="p-4">
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
                      {[
                        ["Année", vehicle.year], ["Kilométrage", `${vehicle.km.toLocaleString("fr-FR")} km`],
                        ["Boîte", vehicle.gearbox], ["Carburant", vehicle.fuel],
                        ["Chevaux fiscaux", `${vehicle.fiscalPower} CV`], ["Puissance", `${vehicle.power} ch`],
                        ...(vehicle.motorisation ? [["Motorisation", vehicle.motorisation]] : []),
                      ].map(([label, value]) => (
                        <div key={label}>
                          <div className="text-[10px]" style={{ color: "#6B776F" }}>{label}</div>
                          <div className="text-[13px] font-medium" style={{ color: "#EDF2EF" }}>{value}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="p-4">
                    {marketData.count === 0 ? (
                      <p className="text-[12px]" style={{ color: "#8C9992" }}>Aucun comparable trouvé pour ce modèle précis — vérifie la cote manuellement avant d'acheter.</p>
                    ) : (
                      <>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[12px]" style={{ color: "#EDF2EF" }}>{marketData.count} comparables · médiane {currency(marketData.median)}</span>
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md" style={{ color: marketData.confidence === "élevée" ? "#22C55E" : marketData.confidence === "moyenne" ? "#E8A33D" : "#E5484D", background: "#0B0F0D" }}>
                            {marketData.confidence}
                          </span>
                        </div>
                        <div className="space-y-2">
                          {marketData.comparables.map((c, i) => (
                            <div key={i} className="flex items-center justify-between py-1.5" style={{ borderTop: i > 0 ? "1px solid #1E2822" : "none" }}>
                              <div className="min-w-0">
                                <div className="text-[12px] truncate" style={{ color: "#EDF2EF" }}>{c.label} — {c.year}</div>
                                <div className="flex items-center gap-1 text-[10px]" style={{ color: "#6B776F" }}>
                                  {c.location && (<><MapPin size={10} /> Dép. {c.location} · </>)}{c.km.toLocaleString("fr-FR")} km
                                </div>
                              </div>
                              <span className="ap-display text-[12px] font-semibold shrink-0" style={{ color: "#EDF2EF" }}>{currency(c.price)}</span>
                            </div>
                          ))}
                        </div>
                        <p className="text-[10px] mt-2" style={{ color: "#6B776F" }}>Annonces réelles (La Centrale) au moment de l'analyse.</p>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* CTA — sticky */}
      <div className="fixed left-0 right-0 px-5 py-3" style={{ bottom: 64, background: "rgba(15,23,21,0.95)", backdropFilter: "blur(10px)", borderTop: "1px solid #1E2822" }}>
        <div className="max-w-md mx-auto">
          <PrimaryButton onClick={() => { onSave(final); go("history"); }} disabled={incompleteInput} style={{ fontWeight: 900, color: "#04140C" }}>
            Enregistrer cette analyse
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}

function ProblemsScreen({ go, selected, setSelected, vehicle, aiEstimates, setAiEstimate, authToken }) {
  const [customName, setCustomName] = useState("");

  const remove = (name) => {
    const next = { ...selected };
    delete next[name];
    setSelected(next);
  };

  const addProblem = () => {
    if (!customName.trim()) return;
    const name = customName.trim();
    setSelected({ ...selected, [name]: "modere" });
    setAiEstimate(name, { loading: true });
    getAiEstimateFromDescription(name, vehicle, authToken).then((est) => {
      setAiEstimate(name, { ...est, loading: false });
      setSelected((prev) => ({ ...prev, [name]: est.severityKey }));
    });
    setCustomName("");
  };

  const problemNames = Object.keys(selected);

  return (
    <div className="pb-24">
      <Header title="Le véhicule a-t-il des problèmes ?" onBack={() => go("result")} />
      <div className="px-5 space-y-3">
        <DemoBanner text="Décris chaque problème avec tes mots — l'IA détermine seule la gravité (léger/modéré/important/critique) et une fourchette de réparation réaliste pour ce véhicule précis." />

        <Card className="p-4 flex items-center gap-2">
          <input
            value={customName}
            onChange={(e) => setCustomName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") addProblem(); }}
            placeholder="Ex : bruit au freinage, voyant moteur allumé..."
            className="flex-1 bg-transparent outline-none text-[14px]" style={{ color: "#EDF2EF" }}
          />
          <button onClick={addProblem} disabled={!customName.trim()}><CheckCircle2 size={20} color={customName.trim() ? "#3FBF7F" : "#3FBF7F55"} /></button>
        </Card>

        {problemNames.length === 0 && (
          <Card className="p-6 text-center">
            <Wrench size={22} color="#3FBF7F" className="mx-auto mb-2" />
            <p className="text-[13px]" style={{ color: "#8C9992" }}>Aucun problème signalé pour l'instant.</p>
          </Card>
        )}

        {problemNames.map((name) => {
          const sevKey = selected[name];
          const sev = SEVERITY_LEVELS.find((s) => s.key === sevKey);
          const est = aiEstimates[name];
          return (
            <Card key={name} className="p-4">
              <div className="flex items-center gap-3">
                <Wrench size={16} color="#3FBF7F" />
                <span className="flex-1 text-[14px] font-medium" style={{ color: "#EDF2EF" }}>{name}</span>
                <button onClick={() => remove(name)}><X size={16} color="#6B776F" /></button>
              </div>
              <div className="flex items-center justify-between mt-3 pt-3" style={{ borderTop: "1px solid #1E2822" }}>
                {est?.loading ? (
                  <span className="text-[12px]" style={{ color: "#6B776F" }}>Analyse IA en cours...</span>
                ) : est ? (
                  <>
                    <div className="flex items-center gap-1.5 rounded-full px-2.5 py-1" style={{ background: `${sev.color}22` }}>
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: sev.color }} />
                      <span className="text-[11px] font-semibold" style={{ color: sev.color }}>{sev.label} — déterminé par l'IA</span>
                    </div>
                    <span className="ap-display text-[13px] font-semibold" style={{ color: sev.color }}>{est.minCost}–{est.maxCost} €</span>
                  </>
                ) : null}
              </div>
              {est && !est.loading && est.explanation && (
                <p className="text-[11px] mt-2.5 leading-snug flex items-start gap-1.5" style={{ color: "#8C9992" }}>
                  <Sparkles size={12} color="#D4A94A" className="shrink-0 mt-0.5" />
                  {est.explanation}
                </p>
              )}
            </Card>
          );
        })}

        <PrimaryButton onClick={() => go("result")}>Valider</PrimaryButton>
      </div>
    </div>
  );
}

function DamageScreen({ go, photos, setPhotos, vehicle, authToken }) {
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  useEffect(() => {
    if (!cameraOpen) return;
    let cancelled = false;
    setCameraError("");
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("La caméra n'est pas accessible dans cet environnement. Utilise l'ajout manuel ci-dessous.");
      return;
    }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
      .then((stream) => {
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      })
      .catch(() => {
        setCameraError("Accès à la caméra refusé ou indisponible. Utilise l'ajout manuel ci-dessous.");
      });
    return () => {
      cancelled = true;
      if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null; }
    };
  }, [cameraOpen]);

  // Ajout manuel (sans photo réelle) : reste en mode démonstration.
  const addPhotoManually = () => {
    const next = DAMAGE_POOL[photos.length % DAMAGE_POOL.length];
    setPhotos([...photos, next]);
  };

  // Capture la frame vidéo actuelle et l'envoie au backend pour une vraie
  // analyse IA (vision). Retombe sur une entrée simulée si la caméra ou
  // l'analyse échoue, pour ne jamais bloquer l'utilisateur.
  const capturePhoto = async () => {
    if (cameraError || !videoRef.current || !videoRef.current.videoWidth) {
      addPhotoManually();
      return;
    }
    const video = videoRef.current;
    // Une image plus grande ne rend pas l'analyse plus précise (identifier un
    // dégât ne demande pas la haute résolution) mais coûte nettement plus cher
    // en tokens IA — on plafonne donc le plus grand côté à 1024px.
    const MAX_EDGE = 1024;
    const scale = Math.min(1, MAX_EDGE / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
    const imageBase64 = dataUrl.split(",")[1];

    setAnalyzing(true);
    try {
      const result = await getPhotoDamageEstimate(imageBase64, "image/jpeg", vehicle, authToken);
      setPhotos([...photos, result]);
      setCameraOpen(false);
    } catch (e) {
      addPhotoManually();
      setCameraOpen(false);
    } finally {
      setAnalyzing(false);
    }
  };

  const totalMin = photos.reduce((s, p) => s + p.min, 0);
  const totalMax = photos.reduce((s, p) => s + p.max, 0);
  const levelColor = { orange: "#E8A33D", yellow: "#D4C24A", red: "#E5484D" };

  return (
    <div className="pb-24">
      <Header title="État esthétique" onBack={() => go("result")} />
      <div className="px-5 space-y-4">
        {!cameraOpen ? (
          <button onClick={() => setCameraOpen(true)} className="w-full rounded-xl py-3.5 font-semibold text-[15px]" style={{ background: "#1B2420", color: "#EDF2EF", border: "1px solid #2B372F" }}>
            📸 Ouvrir la caméra
          </button>
        ) : (
          <Card className="p-6 flex flex-col items-center gap-4">
            <div className="w-full flex items-center justify-between">
              <span className="text-[12px] font-medium" style={{ color: "#8C9992" }}>Caméra — dégâts esthétiques</span>
              <button onClick={() => setCameraOpen(false)}><X size={16} color="#6B776F" /></button>
            </div>
            <div className="w-full aspect-video rounded-xl overflow-hidden flex items-center justify-center relative" style={{ background: "#0B0F0D", border: "1px dashed #2B372F" }}>
              {cameraError ? (
                <div className="text-center px-4">
                  <CameraOff size={26} color="#E5484D" className="mx-auto mb-2" />
                  <span className="text-[12px]" style={{ color: "#8C9992" }}>{cameraError}</span>
                </div>
              ) : (
                <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
              )}
            </div>
            {!cameraError && (
              <p className="text-[11px] text-center leading-snug" style={{ color: "#6B776F" }}>
                Prends une photo nette du dégât — l'IA identifie la pièce concernée, la gravité et une fourchette de réparation.
              </p>
            )}
            <PrimaryButton onClick={cameraError ? addPhotoManually : capturePhoto} disabled={analyzing}>
              {analyzing ? "Analyse en cours..." : cameraError ? "Simuler une photo" : "Capturer et analyser"}
            </PrimaryButton>
          </Card>
        )}
        <GhostButton onClick={addPhotoManually}>+ Ajouter une photo manuellement</GhostButton>
        {photos.map((p, i) => (
          <Card key={i} className="p-4 flex items-center gap-4">
            <div className="w-11 h-11 rounded-xl shrink-0" style={{ background: "#1B2420" }} />
            <div className="flex-1">
              <div className="text-[14px] font-semibold" style={{ color: "#EDF2EF" }}>{p.part}</div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="w-2 h-2 rounded-full" style={{ background: levelColor[p.level] }} />
                <span className="text-[12px]" style={{ color: "#8C9992" }}>{p.label}</span>
              </div>
            </div>
            <div className="ap-display text-[13px] font-semibold text-right" style={{ color: "#EDF2EF" }}>{p.min}–{p.max} €</div>
          </Card>
        ))}
        {photos.length > 0 && (
          <>
            <Card className="p-5">
              <div className="text-[13px] mb-1" style={{ color: "#8C9992" }}>Estimation totale</div>
              <div className="ap-display text-[24px] font-semibold" style={{ color: "#EDF2EF" }}>{totalMin.toLocaleString("fr-FR")} – {totalMax.toLocaleString("fr-FR")} €</div>
            </Card>
            <p className="text-[12px] leading-relaxed" style={{ color: "#6B776F" }}>Cette estimation est indicative et ne constitue pas un devis professionnel.</p>
          </>
        )}
        <PrimaryButton onClick={() => go("result")}>Valider</PrimaryButton>
      </div>
    </div>
  );
}

function HistoryScreen({ go, authToken, openSavedAnalysis }) {
  const [history, setHistory] = useState(null); // null = chargement en cours
  const [error, setError] = useState("");

  useEffect(() => {
    if (!authToken) { setHistory([]); return; }
    apiFetch("/api/vehicle/analyses", { token: authToken })
      .then((rows) => setHistory(rows))
      .catch((e) => { setError(e.message); setHistory([]); });
  }, [authToken]);

  return (
    <div className="pb-24">
      <Header title="Mes analyses" />
      <div className="px-5 space-y-3">
        <DemoBanner text="Suivi réel : chaque analyse enregistrée reste ici, même si tu fermes l'app ou changes d'appareil." />

        {history === null && (
          <Card className="p-8 text-center">
            <p className="text-[13px]" style={{ color: "#8C9992" }}>Chargement de ton historique...</p>
          </Card>
        )}

        {history !== null && error && (
          <Card className="p-8 text-center">
            <AlertTriangle size={22} color="#E8A33D" className="mx-auto mb-2" />
            <p className="text-[13px]" style={{ color: "#8C9992" }}>Impossible de charger l'historique pour l'instant. Réessaie plus tard.</p>
          </Card>
        )}

        {history !== null && !error && history.length === 0 && (
          <Card className="p-8 text-center">
            <HistoryIcon size={26} color="#3FBF7F" className="mx-auto mb-3" />
            <p className="text-[14px]" style={{ color: "#8C9992" }}>Aucune analyse enregistrée pour l'instant.</p>
          </Card>
        )}

        {history !== null && history.map((h) => {
          const meta = VERDICT_META[h.verdict] || VERDICT_META.negotiate;
          const purchasePrice = Number(h.purchase_price);
          const margin = Number(h.margin);
          const reopenable = !!h.snapshot;
          return (
            <Card key={h.id} className="p-4" onClick={reopenable ? () => openSavedAnalysis(h) : undefined}
              style={reopenable ? { cursor: "pointer" } : {}}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[14px] font-semibold" style={{ color: "#EDF2EF" }}>{h.vehicle_name}</span>
                {reopenable && <ChevronRight size={16} color="#6B776F" />}
              </div>
              <div className="flex items-center justify-between text-[13px] mb-1" style={{ color: "#8C9992" }}>
                <span>Achat : {currency(purchasePrice)}</span>
                <span className="ap-display font-semibold" style={{ color: margin >= 0 ? "#3FBF7F" : "#E5484D" }}>{margin >= 0 ? "+" : ""}{currency(margin)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[12px]" style={{ color: "#6B776F" }}>{new Date(h.created_at).toLocaleDateString("fr-FR")}</span>
                <div className="flex items-center gap-1.5 rounded-full px-2.5 py-1" style={{ background: meta.bg }}>
                  <meta.Icon size={12} color={meta.color} />
                  <span className="text-[11px] font-semibold" style={{ color: meta.color }}>{h.score}/100 · {meta.label}</span>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function PremiumScreen({ go, isPremium, setIsPremium }) {
  const perks = ["Analyses de véhicules", "Décodage VIN automatique", "Cote réelle du marché (La Centrale)", "Verdict IA achat-revente", "Prix d'achat maximum conseillé", "Problèmes mécaniques & décote de risque", "Analyse des dégâts par photo", "Historique des analyses", "Analyses illimitées"];
  return (
    <div className="pb-24">
      <Header title="AutoProfit Premium" onBack={() => go("home")} />
      <div className="px-5 space-y-5">
        <Card className="p-6 text-center" style={{ background: "linear-gradient(160deg, #16211B, #0F1613)" }}>
          <Sparkles size={24} color="#D4A94A" className="mx-auto mb-3" />
          <div className="ap-display text-[32px] font-semibold" style={{ color: "#EDF2EF" }}>39,99 €<span className="text-[15px] font-medium" style={{ color: "#8C9992" }}> / mois</span></div>
        </Card>
        <Card className="p-5">
          <div className="text-[13px] font-semibold mb-3" style={{ color: "#8C9992" }}>AVEC AUTOPROFIT PREMIUM</div>
          <div className="space-y-2.5">
            {perks.map((p) => (<div key={p} className="flex items-center gap-2.5"><CheckCircle2 size={16} color="#3FBF7F" /><span className="text-[14px]" style={{ color: "#EDF2EF" }}>{p}</span></div>))}
          </div>
        </Card>
        {isPremium ? (
          <Card className="p-4 flex items-center gap-2.5"><CheckCircle2 size={18} color="#3FBF7F" /><span className="text-[14px] font-medium" style={{ color: "#EDF2EF" }}>Premium actif — merci !</span></Card>
        ) : (
          <PrimaryButton onClick={() => go("payment")}>Commencer Premium — 39,99 €/mois</PrimaryButton>
        )}
        <p className="text-[11px] text-center leading-relaxed" style={{ color: "#6B776F" }}>Paiement provisoire de démonstration — le vrai paiement se fera via Apple In-App Purchase.</p>
      </div>
    </div>
  );
}

function PaymentScreen({ go, setIsPremium }) {
  const [name, setName] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvc, setCvc] = useState("");
  const [processing, setProcessing] = useState(false);
  const [done, setDone] = useState(false);

  const formatCard = (v) => v.replace(/\D/g, "").slice(0, 16).replace(/(.{4})/g, "$1 ").trim();
  const formatExpiry = (v) => {
    const digits = v.replace(/\D/g, "").slice(0, 4);
    return digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;
  };

  const valid = name.trim().length > 1 && cardNumber.replace(/\s/g, "").length === 16 && expiry.length === 5 && cvc.length >= 3;

  const handlePay = () => {
    setProcessing(true);
    setTimeout(() => {
      setProcessing(false);
      setDone(true);
      setIsPremium(true);
    }, 1200);
  };

  if (done) {
    return (
      <div className="pb-24">
        <Header title="Paiement" onBack={() => go("premium")} />
        <div className="px-5">
          <Card className="p-8 text-center">
            <CheckCircle2 size={28} color="#3FBF7F" className="mx-auto mb-3" />
            <p className="text-[15px] font-semibold mb-1" style={{ color: "#EDF2EF" }}>Paiement provisoire confirmé</p>
            <p className="text-[13px] mb-5" style={{ color: "#8C9992" }}>Ton compte est passé en Premium. Aucune vraie transaction n'a eu lieu — c'est un paiement de démonstration en attendant Apple In-App Purchase.</p>
            <PrimaryButton onClick={() => go("profile")}>Retour au profil</PrimaryButton>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="pb-24">
      <Header title="Paiement" onBack={() => go("premium")} />
      <div className="px-5 space-y-4">
        <DemoBanner text="Paiement provisoire de démonstration : aucune donnée bancaire n'est enregistrée, transmise ou traitée réellement. Le vrai paiement Premium se fera via Apple In-App Purchase." />
        <Card className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-semibold" style={{ color: "#8C9992" }}>AutoProfit Premium</span>
            <span className="ap-display text-[16px] font-semibold" style={{ color: "#EDF2EF" }}>39,99 €/mois</span>
          </div>
          <div>
            <label className="text-[13px] font-medium block mb-2" style={{ color: "#8C9992" }}>Titulaire de la carte</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Prénom Nom"
              className="w-full rounded-xl px-4 py-3 text-[14px] outline-none" style={{ background: "#0B0F0D", border: "1px solid #232E29", color: "#EDF2EF" }} />
          </div>
          <div>
            <label className="text-[13px] font-medium block mb-2" style={{ color: "#8C9992" }}>Numéro de carte</label>
            <div className="flex items-center gap-2 rounded-xl px-4 py-3" style={{ background: "#0B0F0D", border: "1px solid #232E29" }}>
              <CreditCard size={16} color="#6B776F" />
              <input value={cardNumber} onChange={(e) => setCardNumber(formatCard(e.target.value))} placeholder="1234 5678 9012 3456" inputMode="numeric"
                className="bg-transparent outline-none flex-1 text-[14px]" style={{ color: "#EDF2EF" }} />
            </div>
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-[13px] font-medium block mb-2" style={{ color: "#8C9992" }}>Expiration</label>
              <input value={expiry} onChange={(e) => setExpiry(formatExpiry(e.target.value))} placeholder="MM/AA" inputMode="numeric"
                className="w-full rounded-xl px-4 py-3 text-[14px] outline-none" style={{ background: "#0B0F0D", border: "1px solid #232E29", color: "#EDF2EF" }} />
            </div>
            <div className="flex-1">
              <label className="text-[13px] font-medium block mb-2" style={{ color: "#8C9992" }}>CVC</label>
              <input value={cvc} onChange={(e) => setCvc(e.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="123" inputMode="numeric"
                className="w-full rounded-xl px-4 py-3 text-[14px] outline-none" style={{ background: "#0B0F0D", border: "1px solid #232E29", color: "#EDF2EF" }} />
            </div>
          </div>
        </Card>
        <PrimaryButton onClick={handlePay} disabled={!valid || processing}>
          {processing ? "Traitement en cours..." : "Payer 39,99 €"}
        </PrimaryButton>
      </div>
    </div>
  );
}

function ProfileScreen({ go, isPremium, setIsPremium, authUser, authToken, authLoading, onLogin, onLogout }) {
  const [mode, setMode] = useState("login"); // "login" | "signup" | "forgot"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [acceptedLegal, setAcceptedLegal] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Mot de passe oublié
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotStep, setForgotStep] = useState("email"); // "email" | "reset" | "done"
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirm, setNewPasswordConfirm] = useState("");
  const [forgotError, setForgotError] = useState("");
  const [forgotSubmitting, setForgotSubmitting] = useState(false);

  // Formulaire de contact / support
  const [showContact, setShowContact] = useState(false);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [contactSent, setContactSent] = useState(false);
  const [sendingContact, setSendingContact] = useState(false);

  const isAdmin = authUser === ADMIN_EMAIL;

  const handleSubmit = async () => {
    setError("");
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !password) { setError("Renseigne un e-mail et un mot de passe."); return; }
    if (mode === "signup" && password !== confirmPassword) { setError("Les deux mots de passe ne correspondent pas."); return; }
    if (mode === "signup" && !acceptedLegal) { setError("Tu dois accepter les CGU, les CGV et la politique de confidentialité pour créer un compte."); return; }
    setSubmitting(true);
    try {
      const data = await apiFetch(mode === "signup" ? "/api/auth/signup" : "/api/auth/login", {
        method: "POST",
        body: { email: cleanEmail, password },
      });
      await saveToken(data.token);
      onLogin(data.email, data.isPremium, data.token);
    } catch (e) {
      setError(e.message);
    }
    setSubmitting(false);
  };

  const handleForgotEmailSubmit = () => {
    setForgotError("");
    if (!forgotEmail.trim()) { setForgotError("Renseigne ton e-mail."); return; }
    setForgotStep("reset");
  };

  const handleResetPassword = async () => {
    setForgotError("");
    if (!newPassword || newPassword !== newPasswordConfirm) { setForgotError("Les deux mots de passe ne correspondent pas."); return; }
    setForgotSubmitting(true);
    try {
      await apiFetch("/api/auth/reset-password", {
        method: "POST",
        body: { email: forgotEmail.trim().toLowerCase(), newPassword },
      });
      setForgotStep("done");
    } catch (e) {
      setForgotError(e.message);
      if (e.message.includes("Aucun compte")) setForgotStep("email");
    }
    setForgotSubmitting(false);
  };

  const resetForgotFlow = () => {
    setMode("login");
    setForgotStep("email");
    setForgotEmail("");
    setNewPassword("");
    setNewPasswordConfirm("");
    setForgotError("");
  };

  const handleSendContact = async () => {
    if (!subject.trim() || !message.trim()) return;
    setSendingContact(true);
    try {
      await apiFetch("/api/messages", { method: "POST", token: authToken, body: { subject: subject.trim(), message: message.trim() } });
      setContactSent(true);
      setSubject("");
      setMessage("");
    } catch (e) {
      // en cas d'échec réseau, on laisse l'utilisateur réessayer
    }
    setSendingContact(false);
  };

  if (authLoading) {
    return (
      <div className="pb-24">
        <Header title="Profil" />
        <div className="px-5"><Card className="p-8 text-center"><p className="text-[13px]" style={{ color: "#8C9992" }}>Chargement...</p></Card></div>
      </div>
    );
  }

  if (!authUser) {
    if (mode === "forgot") {
      return (
        <div className="pb-24">
          <Header title="Mot de passe oublié" onBack={resetForgotFlow} />
          <div className="px-5 space-y-4">
            <DemoBanner text="Mode démonstration : aucun vrai e-mail n'est envoyé (pas de service d'envoi connecté). Tu peux redéfinir ton mot de passe directement ici." />

            {forgotStep === "email" && (
              <>
                <Card className="p-5">
                  <label className="text-[13px] font-medium block mb-2" style={{ color: "#8C9992" }}>E-mail du compte</label>
                  <div className="flex items-center gap-2 rounded-xl px-4 py-3" style={{ background: "#0B0F0D", border: "1px solid #232E29" }}>
                    <Mail size={16} color="#6B776F" />
                    <input value={forgotEmail} onChange={(e) => setForgotEmail(e.target.value)} placeholder="toi@exemple.com" className="bg-transparent outline-none flex-1 text-[14px]" style={{ color: "#EDF2EF" }} />
                  </div>
                  {forgotError && <p className="text-[12px] mt-2" style={{ color: "#E5484D" }}>{forgotError}</p>}
                </Card>
                <PrimaryButton onClick={handleForgotEmailSubmit} disabled={forgotSubmitting}>
                  {forgotSubmitting ? "..." : "Envoyer le lien de réinitialisation"}
                </PrimaryButton>
              </>
            )}

            {forgotStep === "reset" && (
              <>
                <Card className="p-5 space-y-4">
                  <div>
                    <label className="text-[13px] font-medium block mb-2" style={{ color: "#8C9992" }}>Nouveau mot de passe</label>
                    <div className="flex items-center gap-2 rounded-xl px-4 py-3" style={{ background: "#0B0F0D", border: "1px solid #232E29" }}>
                      <Lock size={16} color="#6B776F" />
                      <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="••••••••" className="bg-transparent outline-none flex-1 text-[14px]" style={{ color: "#EDF2EF" }} />
                    </div>
                  </div>
                  <div>
                    <label className="text-[13px] font-medium block mb-2" style={{ color: "#8C9992" }}>Confirmer le mot de passe</label>
                    <div className="flex items-center gap-2 rounded-xl px-4 py-3" style={{ background: "#0B0F0D", border: "1px solid #232E29" }}>
                      <Lock size={16} color="#6B776F" />
                      <input type="password" value={newPasswordConfirm} onChange={(e) => setNewPasswordConfirm(e.target.value)} placeholder="••••••••" className="bg-transparent outline-none flex-1 text-[14px]" style={{ color: "#EDF2EF" }} />
                    </div>
                  </div>
                  {forgotError && <p className="text-[12px]" style={{ color: "#E5484D" }}>{forgotError}</p>}
                </Card>
                <PrimaryButton onClick={handleResetPassword} disabled={forgotSubmitting}>
                  {forgotSubmitting ? "..." : "Réinitialiser le mot de passe"}
                </PrimaryButton>
              </>
            )}

            {forgotStep === "done" && (
              <Card className="p-8 text-center">
                <CheckCircle2 size={26} color="#3FBF7F" className="mx-auto mb-3" />
                <p className="text-[14px] font-semibold mb-1" style={{ color: "#EDF2EF" }}>Mot de passe mis à jour</p>
                <p className="text-[13px] mb-5" style={{ color: "#8C9992" }}>Tu peux te connecter avec ton nouveau mot de passe.</p>
                <PrimaryButton onClick={resetForgotFlow}>Retour à la connexion</PrimaryButton>
              </Card>
            )}
          </div>
        </div>
      );
    }

    return (
      <div className="pb-24">
        <Header title={mode === "login" ? "Connexion" : "Créer un compte"} />
        <div className="px-5 space-y-4">
          {STORAGE_AVAILABLE ? (
            <DemoBanner text="Ton compte est enregistré et partagé entre les utilisateurs de cette démo (nécessaire pour le dashboard admin). Pour un vrai lancement, il faudra un backend avec de vraies règles d'accès — voir .env.example." />
          ) : (
            <DemoBanner text="Stockage persistant indisponible ici : la connexion ne survivra pas à la fermeture de cette fenêtre." />
          )}
          <Card className="p-5 space-y-4">
            <div>
              <label className="text-[13px] font-medium block mb-2" style={{ color: "#8C9992" }}>E-mail</label>
              <div className="flex items-center gap-2 rounded-xl px-4 py-3" style={{ background: "#0B0F0D", border: "1px solid #232E29" }}>
                <Mail size={16} color="#6B776F" />
                <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="toi@exemple.com" className="bg-transparent outline-none flex-1 text-[14px]" style={{ color: "#EDF2EF" }} />
              </div>
            </div>
            <div>
              <label className="text-[13px] font-medium block mb-2" style={{ color: "#8C9992" }}>Mot de passe</label>
              <div className="flex items-center gap-2 rounded-xl px-4 py-3" style={{ background: "#0B0F0D", border: "1px solid #232E29" }}>
                <Lock size={16} color="#6B776F" />
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className="bg-transparent outline-none flex-1 text-[14px]" style={{ color: "#EDF2EF" }} />
              </div>
            </div>
            {mode === "signup" && (
              <div>
                <label className="text-[13px] font-medium block mb-2" style={{ color: "#8C9992" }}>Confirmer le mot de passe</label>
                <div className="flex items-center gap-2 rounded-xl px-4 py-3" style={{ background: "#0B0F0D", border: "1px solid #232E29" }}>
                  <Lock size={16} color="#6B776F" />
                  <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="••••••••" className="bg-transparent outline-none flex-1 text-[14px]" style={{ color: "#EDF2EF" }} />
                </div>
              </div>
            )}
            {mode === "login" && (
              <button onClick={() => { setMode("forgot"); setForgotEmail(email); setForgotStep("email"); setForgotError(""); }} className="text-[12px]" style={{ color: "#3FBF7F" }}>
                Mot de passe oublié ?
              </button>
            )}
            {mode === "signup" && (
              <button onClick={() => setAcceptedLegal(!acceptedLegal)} className="w-full flex items-start gap-2.5 text-left">
                <div className="w-5 h-5 rounded-md flex items-center justify-center shrink-0 mt-0.5" style={{ background: acceptedLegal ? "#3FBF7F" : "transparent", border: acceptedLegal ? "none" : "1px solid #2B372F" }}>
                  {acceptedLegal && <CheckCircle2 size={14} color="#08120D" />}
                </div>
                <span className="text-[12px] leading-snug" style={{ color: "#8C9992" }}>
                  J'accepte les <span style={{ color: "#3FBF7F" }}>CGU</span>, les <span style={{ color: "#3FBF7F" }}>CGV</span> et la <span style={{ color: "#3FBF7F" }}>politique de confidentialité</span> d'AutoProfit.
                </span>
              </button>
            )}
            {error && <p className="text-[12px]" style={{ color: "#E5484D" }}>{error}</p>}
          </Card>

          <div className="flex justify-center gap-4">
            {["mentions", "cgu", "cgv", "privacy"].map((k) => (
              <button key={k} onClick={() => go(`legal:${k}`)} className="text-[11px] underline" style={{ color: "#6B776F" }}>
                {LEGAL_DOCS[k].title}
              </button>
            ))}
          </div>

          <PrimaryButton onClick={handleSubmit} disabled={submitting}>
            {submitting ? "..." : mode === "login" ? "Se connecter" : "Créer mon compte"}
          </PrimaryButton>
          <GhostButton onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(""); }}>
            {mode === "login" ? "Créer un compte" : "J'ai déjà un compte"}
          </GhostButton>

          <button
            onClick={() => onLogin("apercu@demo.local", false, "apercu-local-pas-un-vrai-token")}
            className="w-full text-center text-[12px] underline mt-2"
            style={{ color: "#6B776F" }}
          >
            🔍 Explorer l'app sans se connecter (aperçu design — aucune donnée réelle)
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="pb-24">
      <Header title="Profil" />
      <div className="px-5 space-y-4">
        <Card className="p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: "#1B2420" }}><User size={20} color="#3FBF7F" /></div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <div className="text-[15px] font-semibold" style={{ color: "#EDF2EF" }}>Utilisateur AutoProfit</div>
              {isAdmin && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-md" style={{ color: "#D4A94A", background: "rgba(212,169,74,0.15)" }}>ADMIN</span>
              )}
            </div>
            <div className="text-[12px]" style={{ color: "#8C9992" }}>{authUser}</div>
          </div>
        </Card>

        {isAdmin && (
          <button onClick={() => go("admin")} className="w-full">
            <Card className="p-4 flex items-center gap-3" style={{ borderColor: "#D4A94A55" }}>
              <ShieldCheck size={18} color="#D4A94A" />
              <div className="flex-1 text-left">
                <div className="text-[14px] font-semibold" style={{ color: "#EDF2EF" }}>Dashboard Admin</div>
                <div className="text-[12px]" style={{ color: "#8C9992" }}>Utilisateurs, abonnements, messagerie support</div>
              </div>
              <ChevronRight size={18} color="#6B776F" />
            </Card>
          </button>
        )}

        <Card className="p-5">
          <div className="text-[13px] mb-2" style={{ color: "#8C9992" }}>Mon abonnement</div>
          <div className="flex items-center justify-between mb-3">
            <span className="text-[15px] font-semibold" style={{ color: "#EDF2EF" }}>{isPremium ? "AutoProfit Premium" : "Plan Gratuit"}</span>
            {isPremium && <span className="ap-display text-[14px] font-semibold" style={{ color: "#EDF2EF" }}>39,99 €/mois</span>}
          </div>
          <div className="flex items-center gap-1.5 mb-4"><span className="w-2 h-2 rounded-full" style={{ background: isPremium ? "#3FBF7F" : "#6B776F" }} /><span className="text-[12px]" style={{ color: "#8C9992" }}>{isPremium ? "Actif" : "Inactif"}</span></div>
          {isPremium ? <GhostButton onClick={() => setIsPremium(false)}>Gérer mon abonnement</GhostButton> : <PrimaryButton onClick={() => go("premium")}>Passer Premium</PrimaryButton>}
        </Card>

        <Card className="p-4"><button onClick={() => go("premium")} className="w-full flex items-center gap-3 py-1"><CreditCard size={17} color="#8C9992" /><span className="flex-1 text-left text-[14px]" style={{ color: "#EDF2EF" }}>Facturation</span><ChevronRight size={16} color="#6B776F" /></button></Card>

        {/* Aide & Support */}
        <Card className="p-5">
          <button onClick={() => { setShowContact(!showContact); setContactSent(false); }} className="w-full flex items-center gap-3">
            <HelpCircle size={18} color="#3FBF7F" />
            <span className="flex-1 text-left text-[14px] font-semibold" style={{ color: "#EDF2EF" }}>Aide & Support</span>
            <ChevronRight size={16} color="#6B776F" style={{ transform: showContact ? "rotate(90deg)" : "none", transition: "transform 0.15s" }} />
          </button>
          {showContact && (
            <div className="mt-4 pt-4" style={{ borderTop: "1px solid #1E2822" }}>
              {contactSent ? (
                <div className="text-center py-2">
                  <CheckCircle2 size={22} color="#3FBF7F" className="mx-auto mb-2" />
                  <p className="text-[13px]" style={{ color: "#EDF2EF" }}>Message envoyé — on te répond au plus vite.</p>
                </div>
              ) : (
                <>
                  <label className="text-[12px] font-medium block mb-1.5" style={{ color: "#8C9992" }}>Objet</label>
                  <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Ex : problème sur une analyse"
                    className="w-full rounded-xl px-3 py-2.5 text-[13px] outline-none mb-3" style={{ background: "#0B0F0D", border: "1px solid #232E29", color: "#EDF2EF" }} />
                  <label className="text-[12px] font-medium block mb-1.5" style={{ color: "#8C9992" }}>Message</label>
                  <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={4} placeholder="Décris ta demande..."
                    className="w-full rounded-xl px-3 py-2.5 text-[13px] outline-none mb-3 resize-none" style={{ background: "#0B0F0D", border: "1px solid #232E29", color: "#EDF2EF" }} />
                  <PrimaryButton onClick={handleSendContact} disabled={!subject.trim() || !message.trim() || sendingContact}>
                    {sendingContact ? "Envoi..." : "Envoyer"}
                  </PrimaryButton>
                </>
              )}
            </div>
          )}
        </Card>

        <GhostButton onClick={async () => { await clearToken(); onLogout(); }}><span className="flex items-center justify-center gap-2"><LogOut size={15} /> Déconnexion</span></GhostButton>
        <div className="flex justify-center gap-4 pt-2">
          {["mentions", "cgu", "cgv", "privacy"].map((k) => (
            <button key={k} onClick={() => go(`legal:${k}`)} className="text-[11px] underline" style={{ color: "#6B776F" }}>
              {LEGAL_DOCS[k].title}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function AdminScreen({ go, authUser, authToken }) {
  const [tab, setTab] = useState("users");
  const [users, setUsers] = useState(null);
  const [messages, setMessages] = useState(null);
  const [openMessageId, setOpenMessageId] = useState(null);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    apiFetch("/api/users", { token: authToken }).then(setUsers).catch((e) => setLoadError(e.message));
    apiFetch("/api/messages", { token: authToken }).then(setMessages).catch((e) => setLoadError(e.message));
  }, [authToken]);

  const markRead = async (id) => {
    const next = messages.map((m) => (m.id === id ? { ...m, is_read: true } : m));
    setMessages(next);
    try { await apiFetch(`/api/messages/${id}/read`, { method: "PATCH", token: authToken }); } catch {}
  };

  const userList = users || [];
  const unreadCount = messages ? messages.filter((m) => !m.is_read).length : 0;

  return (
    <div className="pb-24">
      <Header title="Dashboard Admin" onBack={() => go("profile")} />
      <div className="px-5 space-y-4">
        <DemoBanner text="Connecté à ta vraie base de données (Supabase) via ton backend en ligne — ces utilisateurs et messages sont réels." />
        {loadError && <DemoBanner text={`Erreur de chargement : ${loadError}`} />}

        <div className="flex rounded-xl p-1" style={{ background: "#141C18", border: "1px solid #232E29" }}>
          <button onClick={() => setTab("users")} className="flex-1 py-2.5 rounded-lg text-[13px] font-semibold"
            style={{ background: tab === "users" ? "#1B2420" : "transparent", color: tab === "users" ? "#3FBF7F" : "#8C9992" }}>
            Utilisateurs ({userList.length})
          </button>
          <button onClick={() => setTab("messages")} className="flex-1 py-2.5 rounded-lg text-[13px] font-semibold"
            style={{ background: tab === "messages" ? "#1B2420" : "transparent", color: tab === "messages" ? "#3FBF7F" : "#8C9992" }}>
            Messages {unreadCount > 0 ? `(${unreadCount})` : ""}
          </button>
        </div>

        {tab === "users" && (
          <>
            {users === null && <Card className="p-6 text-center"><p className="text-[13px]" style={{ color: "#8C9992" }}>Chargement...</p></Card>}
            {users !== null && userList.length === 0 && <Card className="p-6 text-center"><p className="text-[13px]" style={{ color: "#8C9992" }}>Aucun utilisateur inscrit.</p></Card>}
            {userList.map((u) => (
              <Card key={u.email} className="p-4">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[13px] font-medium truncate" style={{ color: "#EDF2EF" }}>{u.email}</span>
                    {u.email === ADMIN_EMAIL && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ color: "#D4A94A", background: "rgba(212,169,74,0.15)" }}>ADMIN</span>}
                  </div>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md shrink-0" style={{ color: u.is_premium ? "#3FBF7F" : "#8C9992", background: u.is_premium ? "rgba(63,191,127,0.12)" : "#0B0F0D" }}>
                    {u.is_premium ? "Premium" : "Gratuit"}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px]" style={{ color: "#6B776F" }}>
                  <span>Inscrit le {u.created_at ? new Date(u.created_at).toLocaleDateString("fr-FR") : "—"}</span>
                  <span>{u.analyses_count || 0} analyse{(u.analyses_count || 0) > 1 ? "s" : ""}</span>
                </div>
              </Card>
            ))}
          </>
        )}

        {tab === "messages" && (
          <>
            {messages === null && <Card className="p-6 text-center"><p className="text-[13px]" style={{ color: "#8C9992" }}>Chargement...</p></Card>}
            {messages !== null && messages.length === 0 && <Card className="p-6 text-center"><p className="text-[13px]" style={{ color: "#8C9992" }}>Aucun message reçu.</p></Card>}
            {messages && messages.map((m) => (
              <Card key={m.id} className="p-4" style={{ borderColor: m.is_read ? "#232E29" : "#3FBF7F55" }}>
                <button onClick={() => { setOpenMessageId(openMessageId === m.id ? null : m.id); if (!m.is_read) markRead(m.id); }} className="w-full text-left">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[13px] font-semibold" style={{ color: "#EDF2EF" }}>{m.subject}</span>
                    {!m.is_read && <span className="w-2 h-2 rounded-full shrink-0" style={{ background: "#3FBF7F" }} />}
                  </div>
                  <div className="flex items-center justify-between text-[11px]" style={{ color: "#6B776F" }}>
                    <span>{m.from_email}</span>
                    <span>{new Date(m.created_at).toLocaleDateString("fr-FR")} {new Date(m.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                </button>
                {openMessageId === m.id && (
                  <p className="text-[13px] mt-3 pt-3 leading-relaxed" style={{ color: "#C7D1CC", borderTop: "1px solid #1E2822" }}>{m.message}</p>
                )}
              </Card>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

// ---------- App ----------
export default function AutoProfit() {
  const [screen, setScreen] = useState("home");
  const [vehicle, setVehicle] = useState(null);
  const [marketData, setMarketData] = useState(null);
  const [purchasePrice, setPurchasePrice] = useState(0);
  const [verdict, setVerdict] = useState(null);
  const [verdictLoading, setVerdictLoading] = useState(false);
  const [cgRegion, setCgRegion] = useState(CARTE_GRISE_REGIONS[0]);
  const [cgIsPro, setCgIsPro] = useState(false);
  const [problems, setProblems] = useState({});
  const [aiEstimates, setAiEstimates] = useState({});
  const setAiEstimate = (name, patch) => setAiEstimates((prev) => ({ ...prev, [name]: { ...prev[name], ...patch } }));
  const [photos, setPhotos] = useState([]);
  const [isPremium, setIsPremium] = useState(false);
  const [history, setHistory] = useState([]);
  const [analysisLog, setAnalysisLog] = useState([]);
  const [authUser, setAuthUser] = useState(null);
  const [authToken, setAuthToken] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Au démarrage : si un jeton est déjà stocké sur l'appareil, on vérifie
  // qu'il est toujours valide auprès du vrai backend et on récupère le profil.
  useEffect(() => {
    loadToken().then(async (token) => {
      if (!token) { setAuthLoading(false); return; }
      try {
        const me = await apiFetch("/api/users/me", { token });
        setAuthUser(me.email);
        setAuthToken(token);
        setIsPremium(!!me.is_premium);
      } catch {
        await clearToken(); // jeton expiré ou invalide
      }
      setAuthLoading(false);
    });
  }, []);

  // Historique réel des analyses (sert aussi à calculer le quota glissant sur 7 jours)
  useEffect(() => {
    if (authUser && authToken) {
      apiFetch("/api/vehicle/analyses", { token: authToken })
        .then((rows) => setAnalysisLog(rows.map((r) => new Date(r.created_at).getTime())))
        .catch(() => setAnalysisLog([]));
    } else {
      setAnalysisLog([]);
    }
  }, [authUser, authToken]);

  const weeklyUsed = useMemo(() => {
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return analysisLog.filter((t) => t > weekAgo).length;
  }, [analysisLog]);
  const limitReached = !isPremium && weeklyUsed >= FREE_WEEKLY_LIMIT;

  const repairRange = useMemo(() => {
    let problemsMin = 0, problemsMax = 0;
    Object.entries(problems).forEach(([name, sevKey]) => {
      const est = aiEstimates[name];
      if (est && !est.loading && typeof est.minCost === "number") {
        problemsMin += est.minCost;
        problemsMax += est.maxCost;
      } else {
        const sev = SEVERITY_LEVELS.find((s) => s.key === sevKey);
        const base = PROBLEM_BASE_COST[name] ?? 500;
        problemsMin += Math.round(base * sev.mult * 0.8);
        problemsMax += Math.round(base * sev.mult * 1.2);
      }
    });
    let photosMin = 0, photosMax = 0;
    photos.forEach((p) => { photosMin += p.min; photosMax += p.max; });
    return {
      min: problemsMin + photosMin,
      max: problemsMax + photosMax,
      problemsMid: Math.round((problemsMin + problemsMax) / 2),
      photosMid: Math.round((photosMin + photosMax) / 2),
    };
  }, [problems, photos, aiEstimates]);
  const repairCostsMin = repairRange.min;
  const repairCostsMax = repairRange.max;
  const repairCosts = useMemo(() => Math.round((repairCostsMin + repairCostsMax) / 2), [repairCostsMin, repairCostsMax]);

  const riskDiscount = useMemo(() => {
    if (!vehicle) return 0;
    return Math.round(Object.entries(problems).reduce((sum, [name, sevKey]) => {
      const est = aiEstimates[name];
      if (est && !est.loading && typeof est.riskPct === "number") {
        return sum + vehicle.market * est.riskPct;
      }
      const sev = SEVERITY_LEVELS.find((s) => s.key === sevKey);
      return sum + vehicle.market * sev.riskPct;
    }, 0));
  }, [problems, vehicle, aiEstimates]);

  const go = (s) => setScreen(s);

  // vehicleInput vient du formulaire manuel de ScanScreen (éventuellement
  // pré-rempli via décodage VIN) — plus d'identification à faire ici, juste
  // la recherche de comparables réels pour estimer la cote.
  const handleAnalyze = async (vehicleInput) => {
    if (!authUser) { setScreen("profile"); return; }
    if (limitReached) { setScreen("premium"); return; }
    const md = await fetchMarketData(vehicleInput, authToken);
    const v = { ...vehicleInput, name: `${vehicleInput.brand} ${vehicleInput.model}`.trim(), market: md.mean, referenceMarket: md.mean };
    setVehicle(v);
    setMarketData(md);
    setProblems({});
    setAiEstimates({});
    setPhotos([]);
    setVerdict(null);
    const resale = Math.round(v.market * 0.945);
    setPurchasePrice(suggestedMaxPurchase(resale, 0));
    setScreen("result");
  };

  // Verdict IA (qualité du deal / revente / risques) — calculé à la demande
  // (une fois à l'arrivée sur le résultat, ou via le bouton "Recalculer"
  // après ajustement du prix) plutôt qu'à chaque frappe, pour limiter le coût.
  const fetchVerdict = async () => {
    if (!vehicle || !purchasePrice || !authToken) return;
    setVerdictLoading(true);
    try {
      const v = await apiFetch("/api/vehicle/verdict", {
        method: "POST",
        token: authToken,
        body: { vehicle, askingPrice: purchasePrice, marketPrice: vehicle.market, repairCosts, riskDiscount, comparables: marketData?.comparables },
      });
      setVerdict(v);
    } catch (e) {
      setVerdict(null);
    } finally {
      setVerdictLoading(false);
    }
  };

  // Enregistre réellement l'analyse dans la base de données (visible ensuite
  // par l'admin) et incrémente le quota côté serveur.
  const handleSave = async (final) => {
    setHistory([{ name: vehicle.name, date: new Date().toLocaleDateString("fr-FR"), purchasePrice, margin: final.margin, score: final.score, verdict: final.verdict }, ...history]);
    if (!authToken) return;
    // Snapshot complet : permet de rouvrir cette analyse plus tard exactement
    // telle qu'elle était (cote, comparables, verdict IA, dégâts/problèmes
    // signalés), sans avoir à tout refaire.
    const snapshot = { vehicle, marketData, purchasePrice, problems, aiEstimates, photos, verdict, cgRegion, cgIsPro };
    try {
      await apiFetch("/api/vehicle/analyses", {
        method: "POST",
        token: authToken,
        body: {
          vehicleName: vehicle.name,
          purchasePrice,
          margin: final.margin,
          score: final.score,
          verdict: final.verdict,
          snapshot,
        },
      });
      setAnalysisLog((prev) => [...prev, Date.now()]);
    } catch (e) {
      // si le quota serveur est dépassé entre-temps, l'analyse reste visible localement
      // mais n'est pas comptabilisée côté serveur
    }
  };

  // Rouvre une analyse passée depuis l'historique, avec tout son contexte
  // (véhicule, cote, verdict IA, dégâts/problèmes) — pas juste les 3 chiffres.
  const openSavedAnalysis = (row) => {
    if (!row.snapshot) return;
    const s = row.snapshot;
    setVehicle(s.vehicle);
    setMarketData(s.marketData);
    setPurchasePrice(s.purchasePrice);
    setProblems(s.problems || {});
    setAiEstimates(s.aiEstimates || {});
    setPhotos(s.photos || []);
    setVerdict(s.verdict || null);
    setCgRegion(s.cgRegion || CARTE_GRISE_REGIONS[0]);
    setCgIsPro(!!s.cgIsPro);
    setScreen("result");
  };

  return (
    <div className="ap-root min-h-screen w-full max-w-md mx-auto relative" style={{ background: "#0B0F0D" }}>
      <FontImport />
      {screen === "home" && <HomeScreen go={go} isPremium={isPremium} weeklyUsed={weeklyUsed} />}
      {screen === "scan" && (
        <ScanScreen
          go={go}
          onAnalyze={handleAnalyze}
          isPremium={isPremium}
          weeklyUsed={weeklyUsed}
          limitReached={limitReached}
          authUser={authUser}
          authLoading={authLoading}
          authToken={authToken}
        />
      )}
      {screen === "result" && vehicle && (
        <ResultScreen vehicle={vehicle} marketData={marketData} go={go} purchasePrice={purchasePrice} setPurchasePrice={setPurchasePrice}
          repairCosts={repairCosts} repairCostsMin={repairCostsMin} repairCostsMax={repairCostsMax} riskDiscount={riskDiscount} onSave={handleSave}
          cgRegion={cgRegion} setCgRegion={setCgRegion} cgIsPro={cgIsPro} setCgIsPro={setCgIsPro}
          problemsCount={Object.keys(problems).length} problemsRepairMid={repairRange.problemsMid}
          photosCount={photos.length} photosRepairMid={repairRange.photosMid}
          verdict={verdict} verdictLoading={verdictLoading} fetchVerdict={fetchVerdict} />
      )}
      {screen === "problems" && (
        <ProblemsScreen go={go} selected={problems} setSelected={setProblems} vehicle={vehicle} aiEstimates={aiEstimates} setAiEstimate={setAiEstimate} authToken={authToken} />
      )}
      {screen === "damage" && <DamageScreen go={go} photos={photos} setPhotos={setPhotos} vehicle={vehicle} authToken={authToken} />}
      {screen === "history" && <HistoryScreen go={go} authToken={authToken} openSavedAnalysis={openSavedAnalysis} />}
      {screen === "premium" && <PremiumScreen go={go} isPremium={isPremium} setIsPremium={setIsPremium} />}
      {screen === "payment" && <PaymentScreen go={go} setIsPremium={setIsPremium} />}
      {screen === "profile" && (
        <ProfileScreen
          go={go}
          isPremium={isPremium}
          setIsPremium={setIsPremium}
          authUser={authUser}
          authToken={authToken}
          authLoading={authLoading}
          onLogin={(email, premiumStatus, token) => { setAuthUser(email); setIsPremium(!!premiumStatus); setAuthToken(token); }}
          onLogout={() => { setAuthUser(null); setIsPremium(false); setAuthToken(null); }}
        />
      )}
      {screen === "admin" && authUser === ADMIN_EMAIL && <AdminScreen go={go} authUser={authUser} authToken={authToken} />}
      {screen.startsWith("legal:") && <LegalDocScreen docKey={screen.split(":")[1]} go={go} />}
      <BottomNav screen={screen} go={go} isAdmin={authUser === ADMIN_EMAIL} />
    </div>
  );
}
