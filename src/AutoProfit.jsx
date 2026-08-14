import React, { useState, useMemo, useEffect, useRef } from "react";
import {
  Car, Camera, CameraOff, ScanLine, TrendingUp, History as HistoryIcon, User, Home as HomeIcon,
  ChevronRight, CheckCircle2, AlertTriangle, XCircle, ArrowLeft, LogOut,
  CreditCard, Lock, Mail, Sparkles, Gauge, Trash2, Info, MapPin, Zap, Cog,
  DoorClosed, Users, Wrench, X, ShieldCheck, HelpCircle
} from "lucide-react";

// ---------- Fonts ----------
const FontImport = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap');
    .ap-root { font-family: 'Inter', sans-serif; }
    .ap-display { font-family: 'Space Grotesk', sans-serif; font-variant-numeric: tabular-nums; }
  `}</style>
);

// ---------- Fictional demo vehicle database (fiche technique complète) ----------
const VEHICLES = [
  { id: 1, brand: "BMW", name: "BMW Série 3 320d xDrive", year: 2019, km: 125000, fuel: "Diesel", power: 190, fiscalPower: 9, gearbox: "Automatique", drivetrain: "4 roues motrices", body: "Berline", doors: 4, seats: 5, market: 19800 },
  { id: 2, brand: "Peugeot", name: "Peugeot 3008 GT", year: 2021, km: 82000, fuel: "Diesel", power: 177, fiscalPower: 9, gearbox: "Automatique", drivetrain: "Traction", body: "SUV", doors: 5, seats: 5, market: 24000 },
  { id: 3, brand: "Audi", name: "Audi A3 35 TDI", year: 2020, km: 96000, fuel: "Diesel", power: 150, fiscalPower: 6, gearbox: "Automatique", drivetrain: "Traction", body: "Berline compacte", doors: 5, seats: 5, market: 21500 },
  { id: 4, brand: "Mercedes", name: "Mercedes Classe A 200d", year: 2020, km: 105000, fuel: "Diesel", power: 150, fiscalPower: 6, gearbox: "Automatique", drivetrain: "Traction", body: "Berline compacte", doors: 5, seats: 5, market: 22000 },
  { id: 5, brand: "Volkswagen", name: "Volkswagen Golf 8", year: 2021, km: 71000, fuel: "Essence", power: 130, fiscalPower: 6, gearbox: "Automatique", drivetrain: "Traction", body: "Berline compacte", doors: 5, seats: 5, market: 20500 },
  { id: 6, brand: "Renault", name: "Renault Clio V", year: 2022, km: 54000, fuel: "Essence", power: 100, fiscalPower: 4, gearbox: "Manuelle", drivetrain: "Traction", body: "Citadine", doors: 5, seats: 5, market: 15500 },
];

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
  const total = y1 + antsFees + CG_SERVICE_FEE;
  return { y1, y4: CG_Y4, y5: CG_Y5, antsFees, serviceFee: CG_SERVICE_FEE, total };
}

function currency2(n) {
  return n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
}
const FREE_WEEKLY_LIMIT = 3;

// ---------------------------------------------------------------------------
// COUCHE "PROVIDERS" — interfaces séparées comme demandé :
//   VehicleIdentificationProvider / VehicleSpecificationsProvider
//   MarketDataProvider / DamageAnalysisProvider
//
// En production, ces fonctions doivent appeler TON BACKEND (jamais une API
// tierce directement depuis le frontend, pour ne pas exposer de clé) :
//   - identification + fiche technique -> revendeur d'API plaque SIV
//     (ex: api-plaque-immatriculation.com, ~100 champs, dès 0€ pour tester)
//   - kilométrage -> AUCUNE source publique fiable pour un acheteur tiers
//     (HistoVec existe mais n'est consultable que par le propriétaire du
//     véhicule) : c'est la seule donnée que l'utilisateur doit saisir.
//   - prix du marché -> ta base de comparables ou une cote licenciée
//     (Argus / AAA Data), voir .env.example.
//
// Tant qu'aucun provider réel n'est configuré, tout est clairement marqué
// "démonstration" (isDemo: true) et jamais présenté comme une vraie donnée.
// ---------------------------------------------------------------------------

const REAL_VEHICLE_PROVIDER_CONFIGURED = false;
const REAL_MARKET_PROVIDER_CONFIGURED = false;

function hashString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h;
}

// VehicleIdentificationProvider + VehicleSpecificationsProvider
async function identifyVehicle(rawInput, userKm) {
  if (REAL_VEHICLE_PROVIDER_CONFIGURED) {
    // const res = await fetch(`/api/vehicle-lookup?plate=${encodeURIComponent(rawInput)}`);
    // const data = await res.json();
    // return { ...data, km: userKm || null, isDemo: false };
  }
  const input = (rawInput || "").trim() || "AA-000-AA";
  const idx = hashString(input.toUpperCase()) % VEHICLES.length;
  const base = VEHICLES[idx];
  const km = userKm && userKm > 0 ? userKm : base.km;
  return { ...base, plate: input.toUpperCase(), km, referenceKm: base.km, referenceMarket: base.market, isDemo: true };
}

// MarketDataProvider
async function getMarketData(vehicle) {
  if (REAL_MARKET_PROVIDER_CONFIGURED) {
    // const res = await fetch(`/api/market-data`, { method: "POST", body: JSON.stringify(vehicle) });
    // return await res.json();
  }
  const kmDelta = vehicle.km - vehicle.referenceKm;
  const ratePerKm = vehicle.referenceMarket / 220000;
  const kmAdjustment = -kmDelta * ratePerKm;
  const adjustedMarket = Math.round(Math.max(vehicle.referenceMarket * 0.3, vehicle.referenceMarket + kmAdjustment));
  vehicle.market = adjustedMarket;

  const seed = hashString(vehicle.name + vehicle.year + vehicle.km);
  const count = 20 + (seed % 40);
  const mean = adjustedMarket;
  const median = Math.round(mean * (0.97 + (seed % 10) / 200));
  const min = Math.round(mean * 0.8);
  const max = Math.round(mean * 1.22);
  const confidence = count > 40 ? "élevée" : count > 20 ? "moyenne" : "faible";
  const comparables = [0, 1, 2].map((i) => {
    const jitter = ((seed >> (i * 4)) % 15) - 7;
    return {
      label: vehicle.name, year: vehicle.year - (i === 2 ? 1 : 0),
      km: Math.max(0, vehicle.km + jitter * 900),
      price: Math.round(mean * (1 + jitter / 100)),
      location: ["Lyon", "Villeurbanne", "Saint-Étienne"][i],
    };
  });
  return { count, mean, median, min, max, confidence, comparables, isDemo: true };
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
    text: `AutoProfit permet d'analyser un véhicule d'occasion (plaque ou VIN) pour obtenir une estimation de valeur de marché, un prix d'achat maximum conseillé et une marge potentielle. Ces estimations sont indicatives.

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
    text: `Données collectées : e-mail, mot de passe (haché, jamais en clair), plaque/VIN saisi, kilométrage, historique des analyses, statut d'abonnement.

La plaque d'immatriculation peut permettre d'identifier indirectement le titulaire d'un véhicule : elle est traitée comme une donnée à caractère personnel au sens du RGPD.

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
async function getAiEstimateFromDescription(description, vehicle) {
  const prompt = `Tu es un expert automobile en France. Un acheteur envisage ce véhicule : ${vehicle.name}, ${vehicle.year}, ${vehicle.km} km, moteur ${vehicle.fuel} ${vehicle.power}ch (${vehicle.fiscalPower} CV fiscaux), boîte ${vehicle.gearbox}.
L'utilisateur décrit ce problème avec ses propres mots : "${description}".
Étudie cette description et détermine toi-même la gravité la plus probable, une fourchette de coût de réparation réaliste en France, et une décote de risque.
Réponds UNIQUEMENT avec un objet JSON, sans texte autour, sans balises markdown, au format exact :
{"severity": "<léger|modéré|important|critique>", "minCost": <euros, entier>, "maxCost": <euros, entier>, "riskPct": <décote de risque en fraction de la valeur du véhicule, ex 0.02 pour 2%, entre 0 et 0.1>, "explanation": "<1 phrase en français expliquant l'estimation et la gravité retenue, max 30 mots>"}`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 300,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    const data = await response.json();
    const text = (data.content || []).map((b) => b.text || "").join("").replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(text);
    if (typeof parsed.minCost !== "number" || typeof parsed.maxCost !== "number") throw new Error("format invalide");
    const sevMatch = SEVERITY_LEVELS.find((s) => s.label.toLowerCase() === String(parsed.severity || "").toLowerCase()) || SEVERITY_LEVELS[1];
    return {
      minCost: Math.max(0, Math.round(parsed.minCost)),
      maxCost: Math.max(0, Math.round(parsed.maxCost)),
      riskPct: Math.max(0, Math.min(0.1, parsed.riskPct ?? sevMatch.riskPct)),
      explanation: parsed.explanation || "",
      severityKey: sevMatch.key,
      source: "ai",
    };
  } catch (e) {
    // Fallback : gravité modérée par défaut si l'IA échoue
    const sev = SEVERITY_LEVELS[1];
    return {
      minCost: 300, maxCost: 900, riskPct: sev.riskPct,
      explanation: "Estimation par défaut (l'analyse IA n'a pas pu être obtenue) — ajuste la gravité manuellement si besoin.",
      severityKey: sev.key,
      source: "fallback",
    };
  }
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

// ---------- Shared bits ----------
const Card = ({ children, className = "", style = {} }) => (
  <div className={`rounded-2xl ${className}`} style={{ background: "#141C18", border: "1px solid #232E29", ...style }}>{children}</div>
);

const PrimaryButton = ({ children, onClick, className = "", disabled }) => (
  <button onClick={onClick} disabled={disabled}
    className={`w-full rounded-xl py-3.5 font-semibold text-[15px] transition-all active:scale-[0.98] disabled:opacity-40 ${className}`}
    style={{ background: "linear-gradient(135deg, #3FBF7F, #2E9963)", color: "#08120D" }}>
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

function ScoreGauge({ score, color, size = 108 }) {
  const stroke = 10;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (score / 100) * c;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size / 2} cy={size / 2} r={r} stroke="#232E29" strokeWidth={stroke} fill="none" />
      <circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} fill="none"
        strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`} style={{ transition: "stroke-dashoffset 0.6s ease" }} />
      <text x="50%" y="47%" textAnchor="middle" className="ap-display" fill="#EDF2EF" fontSize="26" fontWeight="700">{score}</text>
      <text x="50%" y="64%" textAnchor="middle" fill="#8C9992" fontSize="11">/ 100</text>
    </svg>
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
          Sache combien acheter <span style={{ color: "#3FBF7F" }}>une voiture</span> pour vraiment gagner de l'argent.
        </h1>
        <p className="text-[15px] leading-relaxed mb-8" style={{ color: "#8C9992" }}>
          Scanne ou saisis une plaque. AutoProfit identifie le véhicule, trouve sa valeur de marché et calcule ta marge — automatiquement.
        </p>
        <PrimaryButton onClick={() => go("scan")}>Analyser un véhicule</PrimaryButton>
        <p className="text-[12px] text-center mt-3" style={{ color: "#6B776F" }}>
          Compte gratuit : 3 analyses/semaine · <span style={{ color: "#D4A94A" }}>Premium : illimité</span>
        </p>
      </div>

      <div className="px-6 pt-8 space-y-4">
        {[
          { n: "01", t: "Identifier", d: "Une plaque suffit", Icon: ScanLine },
          { n: "02", t: "Analyser", d: "Fiche technique + valeur de marché automatiques", Icon: Gauge },
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

function ScanScreen({ go, onAnalyze, isPremium, weeklyUsed, limitReached, authUser, authLoading }) {
  const [tab, setTab] = useState("plate");
  const [value, setValue] = useState("");
  const [km, setKm] = useState("");
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [loading, setLoading] = useState(false);
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  useEffect(() => {
    if (!cameraOpen) return;
    let cancelled = false;
    setCameraError("");
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("La caméra n'est pas accessible dans cet environnement. Utilise la saisie manuelle ci-dessous.");
      return;
    }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
      .then((stream) => {
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      })
      .catch(() => {
        setCameraError("Accès à la caméra refusé ou indisponible. Utilise la saisie manuelle ci-dessous.");
      });
    return () => {
      cancelled = true;
      if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null; }
    };
  }, [cameraOpen]);

  const closeCamera = () => setCameraOpen(false);

  const runAnalyze = async (input) => {
    setLoading(true);
    await onAnalyze(input, Number(km) || 0);
    setLoading(false);
  };

  if (authLoading) {
    return (
      <div className="pb-24">
        <Header title="Analyse ton véhicule" onBack={() => go("home")} />
        <div className="px-5"><Card className="p-8 text-center"><p className="text-[13px]" style={{ color: "#8C9992" }}>Chargement...</p></Card></div>
      </div>
    );
  }

  if (!authUser) {
    return (
      <div className="pb-24">
        <Header title="Analyse ton véhicule" onBack={() => go("home")} />
        <div className="px-5 space-y-4">
          <Card className="p-6 text-center">
            <User size={24} color="#3FBF7F" className="mx-auto mb-3" />
            <p className="text-[15px] font-semibold mb-1" style={{ color: "#EDF2EF" }}>Un compte gratuit est nécessaire</p>
            <p className="text-[13px] mb-5" style={{ color: "#8C9992" }}>
              Crée un compte gratuit pour profiter de tes <span style={{ color: "#EDF2EF", fontWeight: 600 }}>3 analyses par semaine</span>.
              Passe <span style={{ color: "#D4A94A", fontWeight: 600 }}>Premium</span> pour des analyses illimitées.
            </p>
            <PrimaryButton onClick={() => go("profile")}>Créer mon compte gratuit</PrimaryButton>
          </Card>
        </div>
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

  return (
    <div className="pb-24">
      <Header title="Analyse ton véhicule" onBack={() => go("home")} />
      <div className="px-5 space-y-5">
        <QuotaBadge isPremium={isPremium} used={weeklyUsed} />
        <DemoBanner text="Mode démonstration : aucun fournisseur réel n'est encore branché. Une fois connecté (voir .env.example), la plaque suffira à tout identifier automatiquement — comme ici." />

        <div className="flex rounded-xl p-1" style={{ background: "#141C18", border: "1px solid #232E29" }}>
          {["plate", "vin"].map((k) => (
            <button key={k} onClick={() => { setTab(k); setCameraOpen(false); setValue(""); }}
              className="flex-1 py-2 rounded-lg text-[13px] font-medium"
              style={{ background: tab === k ? "#1B2420" : "transparent", color: tab === k ? "#3FBF7F" : "#8C9992" }}>
              {k === "plate" ? "Plaque" : "VIN"}
            </button>
          ))}
        </div>

        <div>
          <label className="text-[13px] font-medium block mb-2" style={{ color: "#8C9992" }}>
            {tab === "plate" ? "Plaque d'immatriculation" : "Numéro VIN"}
          </label>
          <div className="flex gap-2">
            <input value={value} onChange={(e) => setValue(e.target.value.toUpperCase())}
              placeholder={tab === "plate" ? "AA-123-AA" : "VF3XXXXXXXXXXXXXX"}
              className="flex-1 rounded-xl px-4 py-3.5 text-[15px] outline-none"
              style={{ background: "#141C18", border: "1px solid #232E29", color: "#EDF2EF" }} />
            <button onClick={() => setCameraOpen(true)} className="w-14 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: "#1B2420", border: "1px solid #2B372F" }}>
              <Camera size={19} color="#3FBF7F" />
            </button>
          </div>
        </div>

        {cameraOpen && (
          <Card className="p-6 flex flex-col items-center gap-4">
            <div className="w-full flex items-center justify-between">
              <span className="text-[12px] font-medium" style={{ color: "#8C9992" }}>
                Caméra — {tab === "plate" ? "plaque" : "VIN"}
              </span>
              <button onClick={closeCamera}><X size={16} color="#6B776F" /></button>
            </div>
            <div className="w-full aspect-video rounded-xl overflow-hidden flex items-center justify-center relative" style={{ background: "#0B0F0D", border: "1px dashed #2B372F" }}>
              {cameraError ? (
                <div className="text-center px-4">
                  <CameraOff size={26} color="#E5484D" className="mx-auto mb-2" />
                  <span className="text-[12px]" style={{ color: "#8C9992" }}>{cameraError}</span>
                </div>
              ) : (
                <>
                  <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                  <div className="absolute inset-6 rounded-lg pointer-events-none" style={{ border: "2px solid rgba(63,191,127,0.6)" }} />
                </>
              )}
            </div>
            {!cameraError && (
              <p className="text-[11px] text-center leading-snug" style={{ color: "#6B776F" }}>
                La caméra s'active réellement, mais la lecture automatique (OCR) n'est pas encore branchée — capture, puis l'app tire une fiche de démonstration.
              </p>
            )}
            <PrimaryButton onClick={() => runAnalyze(`${tab.toUpperCase()}-CAM-${Date.now()}`)} disabled={loading || !(Number(km) > 0)}>
              {loading ? "Analyse en cours..." : cameraError ? "Simuler un scan" : "Capturer et analyser"}
            </PrimaryButton>
            {!(Number(km) > 0) && (
              <p className="text-[11px] text-center" style={{ color: "#E8A33D" }}>Renseigne le kilométrage ci-dessous avant de continuer.</p>
            )}
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

        <PrimaryButton onClick={() => runAnalyze(value)} disabled={!value.trim() || !(Number(km) > 0) || loading}>
          {loading ? "Analyse en cours..." : !(Number(km) > 0) ? "Renseigne le kilométrage" : "Analyser le véhicule"}
        </PrimaryButton>
      </div>
    </div>
  );
}

function ResultScreen({ vehicle, marketData, go, purchasePrice, setPurchasePrice, repairCosts, repairCostsMin, repairCostsMax, riskDiscount, onSave, cgRegion, setCgRegion, cgIsPro, setCgIsPro }) {
  const [activeTab, setActiveTab] = useState("specs");
  const [cgDetailOpen, setCgDetailOpen] = useState(false);

  const valuation = useMemo(() => computeValuation(vehicle, repairCosts, riskDiscount), [vehicle, repairCosts, riskDiscount]);

  // Revente estimée après remise en état : fixe, sous forme de fourchette (pas de saisie manuelle)
  const resaleRange = useMemo(() => {
    const min = Math.round(vehicle.market * 0.92);
    const max = Math.round(vehicle.market * 0.97);
    return { min, max, mid: Math.round((min + max) / 2) };
  }, [vehicle]);
  const resaleEstimate = resaleRange.mid;

  const suggested = useMemo(() => suggestedMaxPurchase(resaleEstimate, repairCosts), [resaleEstimate, repairCosts]);

  // CV, âge et énergie proviennent automatiquement de la fiche véhicule identifiée par la plaque —
  // seules la région et le statut professionnel restent à préciser.
  const cgIsOld = new Date().getFullYear() - vehicle.year > 10;
  const cgIsElectric = vehicle.fuel === "Électrique";
  const carteGrise = useMemo(
    () => computeCarteGrise(vehicle.fiscalPower, cgRegion, cgIsOld, cgIsElectric, cgIsPro),
    [vehicle, cgRegion, cgIsOld, cgIsElectric, cgIsPro]
  );
  const final = useMemo(
    () => computeFinal(purchasePrice, repairCosts, repairCostsMin, repairCostsMax, resaleEstimate, resaleRange.min, resaleRange.max, carteGrise.total),
    [purchasePrice, repairCosts, repairCostsMin, repairCostsMax, resaleEstimate, resaleRange, carteGrise]
  );
  if (!marketData) return null;
  const meta = VERDICT_META[final.verdict];
  const underAsking = purchasePrice <= suggested;

  return (
    <div className="pb-44">
      {/* HEADER + MINI ALERT */}
      <div className="flex items-center gap-3 px-5 pt-6 pb-3">
        <button onClick={() => go("scan")} className="p-1 -ml-1"><ArrowLeft size={20} color="#EDF2EF" /></button>
        <div className="flex-1 min-w-0">
          <div className="ap-display text-[17px] font-semibold truncate" style={{ color: "#EDF2EF" }}>{vehicle.name}</div>
          <div className="text-[12px]" style={{ color: "#8C9992" }}>{vehicle.year} · {vehicle.plate}</div>
        </div>
        <div className="flex items-center gap-1 rounded-full px-2 py-1 shrink-0" style={{ background: "rgba(212,169,74,0.12)" }}>
          <Info size={10} color="#D4A94A" />
          <span className="text-[10px] font-semibold" style={{ color: "#D4A94A" }}>Démo</span>
        </div>
      </div>

      <div className="px-5 space-y-3">
        {/* BLOC 1 — HERO VERDICT */}
        <Card className="p-5" style={{ background: `linear-gradient(160deg, ${meta.color}14, #0B0F0D 70%)`, border: `1px solid ${meta.color}44` }}>
          <div className="flex items-center gap-4">
            <ScoreGauge score={final.score} color={meta.color} size={88} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 rounded-full px-2.5 py-1 w-fit mb-2" style={{ background: meta.bg }}>
                <meta.Icon size={13} color={meta.color} />
                <span className="text-[11px] font-bold" style={{ color: meta.color }}>{meta.label}</span>
              </div>
              <div className="text-[11px]" style={{ color: "#8C9992" }}>Marge potentielle</div>
              <div className="ap-display text-[21px] font-bold leading-tight" style={{ color: final.margin >= 0 ? "#3FBF7F" : "#E5484D" }}>
                {final.marginMin >= 0 ? "+" : ""}{currency(final.marginMin)} à {final.marginMax >= 0 ? "+" : ""}{currency(final.marginMax)}
              </div>
              <div className="text-[12px] mt-0.5 font-medium" style={{ color: "#8C9992" }}>ROI {final.roi.toFixed(1)} %</div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 mt-4 pt-4" style={{ borderTop: "1px solid #1E2822" }}>
            <div>
              <div className="text-[10px]" style={{ color: "#8C9992" }}>Prix du marché</div>
              <div className="ap-display text-[15px] font-bold" style={{ color: "#D4A94A" }}>{currency(vehicle.market)}</div>
            </div>
            <div>
              <div className="text-[10px]" style={{ color: "#8C9992" }}>Prix max conseillé</div>
              <div className="ap-display text-[15px] font-semibold" style={{ color: underAsking ? "#3FBF7F" : "#E8A33D" }}>{currency(suggested)}</div>
            </div>
            <div>
              <div className="text-[10px]" style={{ color: "#8C9992" }}>Prix vendeur</div>
              <div className="ap-display text-[15px] font-semibold" style={{ color: "#EDF2EF" }}>{currency(purchasePrice)}</div>
            </div>
          </div>
        </Card>

        {/* BLOC 2 — CALCULATEUR & SIMULATION */}
        <Card className="p-5">
          <label className="text-[12px] font-medium block mb-1.5" style={{ color: "#8C9992" }}>Prix demandé par le vendeur</label>
          <input type="number" value={purchasePrice}
            onFocus={(e) => e.target.select()}
            onChange={(e) => setPurchasePrice(Number(e.target.value.replace(/^0+(?=\d)/, "")) || 0)}
            className="w-full rounded-xl px-4 py-3 text-[19px] ap-display font-semibold outline-none mb-3"
            style={{ background: "#0B0F0D", border: "1px solid #232E29", color: "#EDF2EF" }} />

          <div className="grid grid-cols-2 gap-2.5 mb-4">
            <button onClick={() => go("damage")} className="rounded-xl py-2.5 text-[12px] font-semibold" style={{ background: "#1B2420", color: "#EDF2EF", border: "1px solid #2B372F" }}>📸 Dégâts esthétiques</button>
            <button onClick={() => go("problems")} className="rounded-xl py-2.5 text-[12px] font-semibold" style={{ background: "#1B2420", color: "#EDF2EF", border: "1px solid #2B372F" }}>🔧 Problème mécanique</button>
          </div>

          {(repairCosts > 0 || riskDiscount > 0) && (
            <div className="rounded-xl px-4 py-3 mb-4" style={{ background: "#0B0F0D", border: "1px solid #232E29" }}>
              <div className="flex items-center justify-between text-[12px] mb-1">
                <span style={{ color: "#8C9992" }}>Valeur avant problèmes</span>
                <span className="ap-display" style={{ color: "#EDF2EF" }}>{currency(valuation.beforeProblems)}</span>
              </div>
              <div className="flex items-center justify-between text-[12px] mb-1">
                <span style={{ color: "#8C9992" }}>Réparations + décote de risque</span>
                <span className="ap-display" style={{ color: "#E5484D" }}>-{currency(repairCosts + riskDiscount)}</span>
              </div>
              <div className="flex items-center justify-between text-[13px] font-semibold pt-1.5 mt-1" style={{ borderTop: "1px solid #1E2822" }}>
                <span style={{ color: "#EDF2EF" }}>Valeur ajustée</span>
                <span className="ap-display" style={{ color: "#EDF2EF" }}>{currency(valuation.adjustedValue)}</span>
              </div>
            </div>
          )}

          {/* Carte grise synthétique */}
          <div className="pt-1">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[12px] font-semibold" style={{ color: "#8C9992" }}>CARTE GRISE</span>
              <button onClick={() => setCgIsPro(!cgIsPro)} className="flex items-center gap-1.5">
                <div className="w-4 h-4 rounded flex items-center justify-center" style={{ background: cgIsPro ? "#3FBF7F" : "transparent", border: cgIsPro ? "none" : "1px solid #2B372F" }}>
                  {cgIsPro && <CheckCircle2 size={11} color="#08120D" />}
                </div>
                <span className="text-[11px] font-medium" style={{ color: cgIsPro ? "#3FBF7F" : "#8C9992" }}>Pro (achat-revente)</span>
              </button>
            </div>
            <div className="flex gap-2 mb-2">
              <select value={cgRegion} onChange={(e) => setCgRegion(e.target.value)}
                className="flex-1 rounded-xl px-3 py-2.5 text-[12px] outline-none appearance-none"
                style={{ background: "#0B0F0D", border: "1px solid #232E29", color: "#EDF2EF" }}>
                {CARTE_GRISE_REGIONS.map((r) => (<option key={r} value={r}>{r}</option>))}
              </select>
              <div className="rounded-xl px-4 py-2.5 flex items-center justify-center" style={{ background: "#0B0F0D", border: "1px solid #232E29" }}>
                <span className="ap-display text-[14px] font-semibold" style={{ color: "#EDF2EF" }}>{currency2(carteGrise.total)}</span>
              </div>
            </div>
            <button onClick={() => setCgDetailOpen(!cgDetailOpen)} className="flex items-center gap-1 text-[11px]" style={{ color: "#6B776F" }}>
              {cgDetailOpen ? "Masquer le détail" : "Voir le détail des taxes"}
              <ChevronRight size={12} style={{ transform: cgDetailOpen ? "rotate(90deg)" : "none", transition: "transform 0.15s" }} />
            </button>
            {cgDetailOpen && (
              <div className="mt-2 rounded-xl px-4 py-3" style={{ background: "#0B0F0D", border: "1px solid #232E29" }}>
                <div className="flex items-center justify-between text-[12px] py-1">
                  <span style={{ color: "#8C9992" }}>Taxe régionale (Y1){cgIsPro ? " — pro" : cgIsElectric ? " — exonérée" : cgIsOld ? " — −50%, >10 ans" : ""}</span>
                  <span className="ap-display" style={{ color: "#EDF2EF" }}>{currency2(carteGrise.y1)}</span>
                </div>
                <div className="flex items-center justify-between text-[12px] py-1">
                  <span style={{ color: "#8C9992" }}>Taxes ANTS{cgIsPro ? " — pro" : ""}</span>
                  <span className="ap-display" style={{ color: "#EDF2EF" }}>{currency2(carteGrise.antsFees)}</span>
                </div>
                <div className="flex items-center justify-between text-[12px] py-1">
                  <span style={{ color: "#8C9992" }}>Frais de dossier {cgIsPro ? "— pro (0 €)" : "(30 € en moyenne)"}</span>
                  <span className="ap-display" style={{ color: "#EDF2EF" }}>{currency2(carteGrise.serviceFee)}</span>
                </div>
                {cgIsPro && <p className="text-[11px] mt-1" style={{ color: "#3FBF7F" }}>0 € de taxes — statut professionnel.</p>}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between pt-4 mt-4" style={{ borderTop: "1px solid #1E2822" }}>
            <div>
              <div className="text-[11px]" style={{ color: "#8C9992" }}>Coût total d'achat</div>
              <div className="ap-display text-[17px] font-semibold" style={{ color: "#EDF2EF" }}>{currency(final.costTotal)}</div>
            </div>
            <ChevronRight size={16} color="#6B776F" />
            <div className="text-right">
              <div className="text-[11px]" style={{ color: "#8C9992" }}>Revente estimée</div>
              <div className="ap-display text-[15px] font-semibold" style={{ color: "#EDF2EF" }}>{currency(resaleRange.min)} - {currency(resaleRange.max)}</div>
            </div>
          </div>
        </Card>

        {/* BLOC 3 — FONDATIONS & PREUVES (onglets) */}
        <Card className="p-0 overflow-hidden">
          <div className="flex" style={{ borderBottom: "1px solid #1E2822" }}>
            <button onClick={() => setActiveTab("specs")} className="flex-1 py-3 text-[12px] font-semibold"
              style={{ color: activeTab === "specs" ? "#3FBF7F" : "#6B776F", borderBottom: activeTab === "specs" ? "2px solid #3FBF7F" : "2px solid transparent" }}>
              Fiche technique
            </button>
            <button onClick={() => setActiveTab("comparables")} className="flex-1 py-3 text-[12px] font-semibold"
              style={{ color: activeTab === "comparables" ? "#3FBF7F" : "#6B776F", borderBottom: activeTab === "comparables" ? "2px solid #3FBF7F" : "2px solid transparent" }}>
              Comparables
            </button>
          </div>

          {activeTab === "specs" ? (
            <div className="p-4">
              <div className="flex items-center gap-1.5 mb-3">
                <CheckCircle2 size={12} color="#3FBF7F" />
                <span className="text-[11px] font-medium" style={{ color: "#3FBF7F" }}>Identification confirmée (démonstration)</span>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
                {[
                  ["Année", vehicle.year], ["Kilométrage", `${vehicle.km.toLocaleString("fr-FR")} km`],
                  ["Boîte", vehicle.gearbox], ["Carburant", vehicle.fuel],
                  ["Chevaux fiscaux", `${vehicle.fiscalPower} CV`], ["Puissance", `${vehicle.power} ch`],
                  ["Places", vehicle.seats], ["Carrosserie", `${vehicle.body}, ${vehicle.doors}p`],
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
              <div className="flex items-center justify-between mb-2">
                <span className="text-[12px]" style={{ color: "#EDF2EF" }}>{marketData.count} comparables · médiane {currency(marketData.median)}</span>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md" style={{ color: marketData.confidence === "élevée" ? "#3FBF7F" : marketData.confidence === "moyenne" ? "#E8A33D" : "#E5484D", background: "#0B0F0D" }}>
                  {marketData.confidence}
                </span>
              </div>
              <div className="space-y-2">
                {marketData.comparables.map((c, i) => (
                  <div key={i} className="flex items-center justify-between py-1.5" style={{ borderTop: i > 0 ? "1px solid #1E2822" : "none" }}>
                    <div className="min-w-0">
                      <div className="text-[12px] truncate" style={{ color: "#EDF2EF" }}>{c.label} — {c.year}</div>
                      <div className="flex items-center gap-1 text-[10px]" style={{ color: "#6B776F" }}><MapPin size={10} /> {c.location} · {c.km.toLocaleString("fr-FR")} km</div>
                    </div>
                    <span className="ap-display text-[12px] font-semibold shrink-0" style={{ color: "#EDF2EF" }}>{currency(c.price)}</span>
                  </div>
                ))}
              </div>
              <p className="text-[10px] mt-2" style={{ color: "#6B776F" }}>Exemples simulés en mode démonstration.</p>
            </div>
          )}
        </Card>
      </div>

      {/* STICKY BOTTOM BAR */}
      <div className="fixed left-0 right-0 px-5 py-3" style={{ bottom: 64, background: "rgba(11,15,13,0.95)", backdropFilter: "blur(10px)", borderTop: "1px solid #1E2822" }}>
        <div className="max-w-md mx-auto">
          <PrimaryButton onClick={() => { onSave(final); go("history"); }}>Enregistrer cette analyse</PrimaryButton>
        </div>
      </div>
    </div>
  );
}

function ProblemsScreen({ go, selected, setSelected, vehicle, aiEstimates, setAiEstimate }) {
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
    getAiEstimateFromDescription(name, vehicle).then((est) => {
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

function DamageScreen({ go, photos, setPhotos }) {
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState("");
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

  const addPhoto = () => {
    const next = DAMAGE_POOL[photos.length % DAMAGE_POOL.length];
    setPhotos([...photos, next]);
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
                La caméra s'active réellement, mais l'analyse visuelle des dégâts (vision IA) n'est pas encore branchée — capture, puis l'app simule un diagnostic.
              </p>
            )}
            <PrimaryButton onClick={addPhoto}>{cameraError ? "Simuler une photo" : "Capturer et analyser"}</PrimaryButton>
          </Card>
        )}
        <GhostButton onClick={addPhoto}>+ Ajouter une photo manuellement</GhostButton>
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

function HistoryScreen({ go, history, onDelete }) {
  return (
    <div className="pb-24">
      <Header title="Mes analyses" />
      <div className="px-5 space-y-3">
        {history.length === 0 && (
          <Card className="p-8 text-center">
            <HistoryIcon size={26} color="#3FBF7F" className="mx-auto mb-3" />
            <p className="text-[14px]" style={{ color: "#8C9992" }}>Aucune analyse enregistrée pour l'instant.</p>
          </Card>
        )}
        {history.map((h, i) => {
          const meta = VERDICT_META[h.verdict];
          return (
            <Card key={i} className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[14px] font-semibold" style={{ color: "#EDF2EF" }}>{h.name}</span>
                <button onClick={() => onDelete(i)}><Trash2 size={15} color="#6B776F" /></button>
              </div>
              <div className="flex items-center justify-between text-[13px] mb-1" style={{ color: "#8C9992" }}>
                <span>Achat : {currency(h.purchasePrice)}</span>
                <span className="ap-display font-semibold" style={{ color: h.margin >= 0 ? "#3FBF7F" : "#E5484D" }}>{h.margin >= 0 ? "+" : ""}{currency(h.margin)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[12px]" style={{ color: "#6B776F" }}>{h.date}</span>
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
  const perks = ["Analyses de véhicules", "Identification automatique par plaque", "Prix du marché", "Prix d'achat maximum conseillé", "Problèmes mécaniques & décote de risque", "Analyse des dégâts par photo", "Historique des analyses", "Analyses illimitées"];
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
    let min = 0, max = 0;
    Object.entries(problems).forEach(([name, sevKey]) => {
      const est = aiEstimates[name];
      if (est && !est.loading && typeof est.minCost === "number") {
        min += est.minCost;
        max += est.maxCost;
      } else {
        const sev = SEVERITY_LEVELS.find((s) => s.key === sevKey);
        const base = PROBLEM_BASE_COST[name] ?? 500;
        min += Math.round(base * sev.mult * 0.8);
        max += Math.round(base * sev.mult * 1.2);
      }
    });
    photos.forEach((p) => { min += p.min; max += p.max; });
    return { min, max };
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

  const handleAnalyze = async (input, userKm) => {
    if (!authUser) { setScreen("profile"); return; }
    if (limitReached) { setScreen("premium"); return; }
    const v = await identifyVehicle(input, userKm);
    const md = await getMarketData(v);
    setVehicle(v);
    setMarketData(md);
    setProblems({});
    setAiEstimates({});
    setPhotos([]);
    const resale = Math.round(v.market * 0.945);
    setPurchasePrice(suggestedMaxPurchase(resale, 0));
    setScreen("result");
  };

  // Enregistre réellement l'analyse dans la base de données (visible ensuite
  // par l'admin) et incrémente le quota côté serveur.
  const handleSave = async (final) => {
    setHistory([{ name: vehicle.name, date: new Date().toLocaleDateString("fr-FR"), purchasePrice, margin: final.margin, score: final.score, verdict: final.verdict }, ...history]);
    if (!authToken) return;
    try {
      await apiFetch("/api/vehicle/analyses", {
        method: "POST",
        token: authToken,
        body: {
          vehicleName: vehicle.name,
          plate: vehicle.plate,
          purchasePrice,
          margin: final.margin,
          score: final.score,
          verdict: final.verdict,
        },
      });
      setAnalysisLog((prev) => [...prev, Date.now()]);
    } catch (e) {
      // si le quota serveur est dépassé entre-temps, l'analyse reste visible localement
      // mais n'est pas comptabilisée côté serveur
    }
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
        />
      )}
      {screen === "result" && vehicle && (
        <ResultScreen vehicle={vehicle} marketData={marketData} go={go} purchasePrice={purchasePrice} setPurchasePrice={setPurchasePrice}
          repairCosts={repairCosts} repairCostsMin={repairCostsMin} repairCostsMax={repairCostsMax} riskDiscount={riskDiscount} onSave={handleSave}
          cgRegion={cgRegion} setCgRegion={setCgRegion} cgIsPro={cgIsPro} setCgIsPro={setCgIsPro} />
      )}
      {screen === "problems" && (
        <ProblemsScreen go={go} selected={problems} setSelected={setProblems} vehicle={vehicle} aiEstimates={aiEstimates} setAiEstimate={setAiEstimate} />
      )}
      {screen === "damage" && <DamageScreen go={go} photos={photos} setPhotos={setPhotos} />}
      {screen === "history" && <HistoryScreen go={go} history={history} onDelete={(i) => setHistory(history.filter((_, idx) => idx !== i))} />}
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
