const el = (id) => document.getElementById(id);
const canvas = el("card");
const ctx = canvas.getContext("2d");

const FONT_SCALE = 1.18;

const SCORE_FONT_SIZE = 220;
const SCORERS_FONT_SIZE = 34;
const SCORERS_LINE_GAP = 8;
const SCORERS_MAX_ROWS = 5;
const SCORERS_TOP_GAP = 20;

const state = {
  homeLogo: null,
  awayLogo: null,
  placeholderLogo: null,
  bg: null,
  finalBg: null,
  bgMode: "preset",
  playerImage: null,
  signingBg: null,
  sifLogo: null,
  trimmedLeague: "",
};

const COLORS = {
  blue: "#013888",
  white: "#FFFFFF",
  offwhite: "#F4F2EE",
  midgray: "#C5C0B7",
  woodred: "#93331D",
  green: "#306B34",
};

let activeTemplate = "match";
let currentMatch = null;

function getSelectedFormat() {
  const select = el("format");
  const [w, h] = select.value.split("x").map(Number);
  const label = select.options[select.selectedIndex].text;
  return { w, h, label };
}

function slugify(s) {
  return (s || "")
    .toLowerCase()
    .replace(/å/g, "a")
    .replace(/ä/g, "a")
    .replace(/ö/g, "o")
    .replace(/[^\w]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function teamToLogoFilename(teamName) {
  return (teamName || "")
    .trim()
    .toLowerCase()
    .replace(/å/g, "a")
    .replace(/ä/g, "a")
    .replace(/ö/g, "o")
    .replace(/-/g, " ")
    .replace(/[^\w\s]/g, "")
    .replace(/\b(fotboll|herr|herrar)\b/g, "")
    .replace(/\s+(u\d*|a)$/i, "")
    .replace(/\s+/g, "_")
    .replace(/^_+|_+$/g, "") + ".png";
}

function setCanvasSizeFromFormat() {
  const { w, h } = getSelectedFormat();
  canvas.width = w;
  canvas.height = h;
}

function loadImageFromURL(url) {
  return new Promise((resolve, reject) => {
    if (!url) return resolve(null);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

function loadFileImage(file) {
  return new Promise((resolve, reject) => {
    if (!file) return resolve(null);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

function drawNameLineWithBg(text, xText, yText, size, padTop, padBottom, padRight, bgAlpha = 0.15) {
  if (!text) return;

  const w = ctx.measureText(text).width;

  const x0 = -Math.round(canvas.width * 0.04);
  const textH = Math.round(size * 0.90);

  const y0 = Math.round(yText - padTop);
  const rectW = Math.round((xText + w + padRight) - x0);
  const rectH = Math.round(textH + padTop + padBottom);

  ctx.fillStyle = `rgba(0,0,0,${bgAlpha})`;
  ctx.fillRect(x0, y0, rectW, rectH);

  ctx.fillStyle = COLORS.white;
  ctx.fillText(text, xText, yText);
}

/* CSV */
let csvMatches = [];

function fillMatchSelect(matches) {
  const sel = el("matchSelect");
  if (!sel) return;

  sel.innerHTML = "";
  if (!matches.length) {
    sel.disabled = true;
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "— Inga matcher hittades —";
    sel.appendChild(opt);
    return;
  }

  sel.disabled = false;
  const opt0 = document.createElement("option");
  opt0.value = "";
  opt0.textContent = "— Välj match —";
  sel.appendChild(opt0);

  matches.forEach((m, idx) => {
    const opt = document.createElement("option");
    opt.value = String(idx);
    opt.textContent = `${m.date} • ${m.league} • ${m.home} vs ${m.away}`;
    sel.appendChild(opt);
  });
}

function populateMatchFields(m) {
  if (!m) return;

  currentMatch = m;

  el("homeTeam").value = m.home || "";
  el("awayTeam").value = m.away || "";
  if (el("venue")) el("venue").value = m.venue || "";
  if (m.date && el("date")) el("date").value = m.date;
  if (m.time && el("time")) el("time").value = m.time;

  state.trimmedLeague = trimLeague(m.league || "");
  if (el("league")) el("league").value = state.trimmedLeague;
  if (el("round")) el("round").value = m.round || "";
}

async function loadAssetsAndDraw() {
  await autoLoadHomeLogo();
  await autoLoadAwayLogo();
  draw();
}

async function applyMatchToForm(m) {
  if (!m) return;
  populateMatchFields(m);
  await loadAssetsAndDraw();
}

function sanitizeVenueFromCSV(v) {
  let s = (v || "").trim().replace(/\s+/g, " ");
  s = s.replace(/\s+a-plan$/i, "").trim();
  s = s.replace(/\s+a$/i, "").trim();
  s = s.replace(/\s+konst.*$/i, "").trim();
  return s;
}

function parseMatchesFromYourCSV(text) {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim().split("\n");
  if (lines.length < 2) return [];

  const norm = (s) => (s || "").trim().toLowerCase().replace(/\s+/g, "");
  const header = lines[0].split(";").map(norm);

  const iHome = header.indexOf("hemmalag");
  const iAway = header.indexOf("bortalag");
  const iDT = header.indexOf("datum/tid");
  const iVenue = header.indexOf("plats") !== -1 ? header.indexOf("plats") : header.indexOf("anläggning");
  const iLeague = header.indexOf("tävling");
  const iRound = header.indexOf("omg");
  const iResult = header.indexOf("resultat");

  if (iHome === -1 || iAway === -1 || iDT === -1) return [];

  const matches = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(";").map(s => (s ?? "").trim());

    const home = cols[iHome] || "";
    const away = cols[iAway] || "";
    const dt = cols[iDT] || "";
    const venueRaw = iVenue !== -1 ? (cols[iVenue] || "") : "";
    const venue = sanitizeVenueFromCSV(venueRaw);
    const league = iLeague !== -1 ? (cols[iLeague] || "") : "";
    const round = iRound !== -1 ? (cols[iRound] || "") : "";
    const result = iResult !== -1 ? (cols[iResult] || "") : "";

    if (!home || !away) continue;

    let date = "";
    let time = "";
    if (dt) {
      const parts = dt.split(/\s+/);
      date = parts[0] || "";
      time = parts[1] || "";
    }

    matches.push({ home, away, date, time, venue, league, round, result });
  }

  return matches;
}

function normalizeMinutes(raw) {
  const s = (raw || "").trim();
  if (!s) return "";
  const tokens = s
    .replace(/[,;]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  const out = [];
  for (const t of tokens) {
    const m = t.match(/^(\d+)(?:\+(\d+))?/);
    if (!m) continue;
    const base = m[1];
    const extra = m[2];
    out.push(extra ? `${base}+${extra}'` : `${base}'`);
  }
  return out.join(", ");
}

function getScorerLinesFromGrid(side) {
  const out = [];
  for (let i = 0; i < SCORERS_MAX_ROWS; i++) {
    const name = (
      document.querySelector(
        `.scorerName[data-side="${side}"][data-row="${i}"]`
      )?.value || ""
    ).trim();

    let min = (
      document.querySelector(`.scorerMin[data-side="${side}"][data-row="${i}"]`)
        ?.value || ""
    ).trim();

    if (!name) continue;
    min = normalizeMinutes(min);
    out.push(min ? `${name} ${min}` : name);
  }
  return out;
}

async function ensureSifLogo() {
  if (state.sifLogo) return;
  try {
    state.sifLogo = await loadImageFromURL("assets/logo/saters_if_fk.png");
  } catch {
    state.sifLogo = null;
  }
}

el("loadCsvBtn")?.addEventListener("click", async (e) => {
  e.preventDefault();
  const file = el("csvFile")?.files?.[0];
  if (!file) return;
  const text = await file.text();
  csvMatches = parseMatchesFromYourCSV(text);
  fillMatchSelect(csvMatches);
});

el("matchSelect")?.addEventListener("change", async () => {
  const idx = parseInt(el("matchSelect").value, 10);
  if (Number.isNaN(idx)) return;
  const match = csvMatches[idx];
  if (!match) return;

  populateMatchFields(match);
  await loadAssetsAndDraw();
});

/* BACKGROUNDS */
const BACKGROUNDS_MATCH = [
  { id: "bg1", label: "Gräs", url: "assets/bg/blue_grass.png" },
  { id: "bg2", label: "Fotboll", url: "assets/bg/football.png" },
  { id: "bg3", label: "Trävägg", url: "assets/bg/blue_wood.png" },
  { id: "bg4", label: "Säters IP", url: "assets/bg/saters_ip.png" },
  { id: "bg5", label: "Tröja", url: "assets/bg/shirt.png" },
  { id: "bg6", label: "Blåvit pensel", url: "assets/bg/blue_white.png" },
];

const BACKGROUNDS_FINAL = [
  { id: "f1", label: "Säters IP", url: "assets/bg/saters_ip.png" },
  { id: "f2", label: "Match herr", url: "assets/bg/game_m.png" },
  { id: "f3", label: "Match dam", url: "assets/bg/game_w.png" },
  { id: "f4", label: "Max", url: "assets/bg/max.png" },
  { id: "f5", label: "Tröja", url: "assets/bg/shirt.png" },
  { id: "f6", label: "Säter publik", url: "assets/bg/stand.png" },
];

function getActiveBackgroundList() {
  return activeTemplate === "final" ? BACKGROUNDS_FINAL : BACKGROUNDS_MATCH;
}

function ensureBackgroundSelectPopulated() {
  const sel = el("bgSelect");
  if (!sel) return;

  const list = getActiveBackgroundList();
  const prev = sel.value;

  sel.innerHTML = "";
  for (const bg of list) {
    const opt = document.createElement("option");
    opt.value = bg.id;
    opt.textContent = bg.label;
    sel.appendChild(opt);
  }
  sel.value = list.some((b) => b.id === prev) ? prev : (list[0]?.id || "");
}

async function applySelectedBackground() {
  const sel = el("bgSelect");
  if (!sel) return;

  const choice = sel.value;
  const bg = getActiveBackgroundList().find((b) => b.id === choice);

  if (!bg?.url) {
    state.bg = null;
    state.bgMode = "preset";
    return;
  }

  try {
    state.bg = await loadImageFromURL(bg.url);
    state.bgMode = "preset";
  } catch (e) {
    console.warn("Kunde inte ladda vald bakgrund:", bg.url, e);
    state.bg = null;
    state.bgMode = "preset";
  }
}

/* Logos */
let lastHomeKey = "";
let lastAwayKey = "";

async function ensureDefaults() {
  if (!state.placeholderLogo) {
    try {
      state.placeholderLogo = await loadImageFromURL(
        "assets/logo/placeholder.png"
      );
    } catch (e) {
      console.warn("Kunde inte ladda assets/logo/placeholder.png", e);
      state.placeholderLogo = null;
    }
  }
}

async function ensureSigningBg() {
  if (state.signingBg) return;
  try {
    state.signingBg = await loadImageFromURL("assets/bg/blue_wood_sign.png");
  } catch {
    state.signingBg = null;
  }
}

async function handleFiles() {
  await ensureDefaults();

  const transparentTypes = ["image/png", "image/webp", "image/gif"];

  const homeInput = el("homeLogo");
  const homeFile = homeInput?.files?.[0];
  if (homeFile) {
    if (!transparentTypes.includes(homeFile.type)) {
      alert(
        "Endast PNG, WebP eller GIF-filer (med transparens) är tillåtna för hemmaloga."
      );
      homeInput.value = "";
      state.homeLogo = null;
    } else {
      state.homeLogo = await loadFileImage(homeFile);
    }
  }

  const awayInput = el("awayLogo");
  const awayFile = awayInput?.files?.[0];
  if (awayFile) {
    if (!transparentTypes.includes(awayFile.type)) {
      alert(
        "Endast PNG, WebP eller GIF-filer (med transparens) är tillåtna för bortalogga."
      );
      awayInput.value = "";
      state.awayLogo = null;
    } else {
      state.awayLogo = await loadFileImage(awayFile);
    }
  }

  const finalBgInput = el("finalBackground");
  const finalBgFile = finalBgInput?.files?.[0];
  if (finalBgFile) state.finalBg = await loadFileImage(finalBgFile);

  const playerInput = el("playerImage");
  const playerFile = playerInput?.files?.[0];
  if (playerFile) {
    state.playerImage = await loadFileImage(playerFile);
  } else {
    state.playerImage = null;
  }
}

async function autoLoadHomeLogo() {
  await ensureDefaults();

  const homeTeam = ((el("homeTeam")?.value || "")).trim();
  const key = homeTeam.toLowerCase();
  if (key === lastHomeKey) return;
  lastHomeKey = key;

  const homeFile = el("homeLogo")?.files?.[0];
  if (homeFile) return;

  if (!homeTeam) {
    state.homeLogo = null;
    return;
  }

  const url = `assets/logo/${teamToLogoFilename(homeTeam)}`;
  try {
    state.homeLogo = await loadImageFromURL(url);
  } catch {
    state.homeLogo = null;
  }
}

async function autoLoadAwayLogo() {
  await ensureDefaults();

  const awayTeam = ((el("awayTeam")?.value || "")).trim();
  const key = awayTeam.toLowerCase();
  if (key === lastAwayKey) return;
  lastAwayKey = key;

  const awayFile = el("awayLogo")?.files?.[0];
  if (awayFile) return;

  if (!awayTeam) {
    state.awayLogo = null;
    return;
  }

  const url = `assets/logo/${teamToLogoFilename(awayTeam)}`;
  try {
    state.awayLogo = await loadImageFromURL(url);
  } catch {
    state.awayLogo = null;
  }
}

/* Drawing helpers */
function formatDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("sv-SE", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  });
}

function drawCover(img, x, y, w, h, alpha = 1) {
  if (!img) return;
  ctx.save();
  ctx.globalAlpha = alpha;

  const ir = img.width / img.height;
  const rr = w / h;

  let dw, dh, dx, dy;
  if (ir > rr) {
    dh = h;
    dw = h * ir;
    dx = x - (dw - w) / 2;
    dy = y;
  } else {
    dw = w;
    dh = w / ir;
    dx = x;
    dy = y - (dh - h) / 2;
  }

  ctx.drawImage(img, dx, dy, dw, dh);
  ctx.restore();
}

function drawFixedHeightCentered(img, centerX, y, height = 280, alpha = 1) {
  if (!img) return;
  const w = Math.round(height * (img.width / img.height));
  const x = Math.round(centerX - w / 2);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.drawImage(img, x, y, w, height);
  ctx.restore();
}

function fitText(text, maxWidth, startSize, minSize, fontTemplate) {
  let size = startSize;
  while (size >= minSize) {
    ctx.font = fontTemplate.replace("{size}", size);
    if (ctx.measureText(text).width <= maxWidth) return size;
    size -= 2;
  }
  return minSize;
}

function centeredX(text, centerX) {
  const w = ctx.measureText(text).width;
  return Math.round(centerX - w / 2);
}

function wrapLines(text, maxWidth) {
  const words = (text || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const w of words) {
    const test = line ? line + " " + w : w;
    if (ctx.measureText(test).width <= maxWidth) {
      line = test;
    } else {
      if (line) lines.push(line);
      line = w;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function drawOvalFramed(img, x, y, w, h, frameColor, frameW = 10) {
  const cx = x + w / 2;
  const cy = y + h / 2;

  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx, cy, w / 2, h / 2, 0, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();

  if (img) drawCover(img, x, y, w, h, 1);
  else {
    ctx.fillStyle = "rgba(244,242,238,0.65)";
    ctx.fillRect(x, y, w, h);
  }

  ctx.restore();

  ctx.save();
  ctx.strokeStyle = frameColor;
  ctx.lineWidth = frameW;
  ctx.beginPath();
  ctx.ellipse(cx, cy, w / 2 - frameW / 2, h / 2 - frameW / 2, 0, 0, Math.PI * 2);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

function trimLeague(s) {
  const t = (s || "").trim();
  return t.replace(/\b(herr|herrar|dam|damer)\b.+$/i, "$1").trim();
}

/* Shared components */
function drawBase(W, H) {
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = COLORS.offwhite;
  ctx.fillRect(0, 0, W, H);

  const useFinal = activeTemplate === "final" && state.finalBg;
  const bgToDraw = useFinal ? state.finalBg : state.bg;

  if (bgToDraw) {
    if (useFinal)
      ctx.filter = "saturate(0.65) contrast(1.05) brightness(0.98)";
    drawCover(bgToDraw, 0, 0, W, H);
    ctx.filter = "none";
  }

  if (useFinal) {
    ctx.fillStyle = "rgba(1,56,136,0.45)";
    ctx.fillRect(0, 0, W, H);
  }
}

function drawBanner(W, H, cx, text) {
  const baseH = Math.round(H * 0.15);

  const bannerText = (text || "MATCHDAG").trim().toUpperCase();
  const bannerBaseSize = Math.round(Math.min(W, H) * 0.13 * FONT_SCALE);
  const bannerTpl = `900 {size}px "Segoe UI", system-ui`;
  const bannerSize = fitText(bannerText, Math.round(W * 0.9), bannerBaseSize, 18, bannerTpl);

  // league + round under bannerText (smaller)
  const league = state.trimmedLeague;
  const round = (el("round")?.value || "").trim();
  const subText = [league, round ? `OMGÅNG ${round}` : ""].filter(Boolean).join(" • ");

  const subTpl = `800 {size}px "Arial Narrow", system-ui`;
  const subBase = Math.max(14, Math.round(bannerSize * 0.29));
  const subSizeRaw = subText ? fitText(subText, Math.round(W * 0.9), subBase, 12, subTpl) : subBase;
  const subSize = Math.max(10, Math.round(subSizeRaw * 0.78));

  const extraH = (subText && activeTemplate !== "final") ? Math.round(subSize * 1.05) : 0;
  const bannerH = baseH + extraH;

  const angle = (-4 * Math.PI) / 180;

  ctx.save();
  ctx.translate(cx, bannerH * 0.90);
  ctx.rotate(angle);

  ctx.fillStyle = COLORS.blue;
  ctx.fillRect(-W * 0.6, -bannerH / 2, W * 1.2, bannerH);

  ctx.fillStyle = COLORS.white;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // main line
  ctx.font = bannerTpl.replace("{size}", bannerSize);
  const mainY = (subText && activeTemplate !== "final") ? Math.round(-subSize * 0.55) : 0;
  ctx.fillText(bannerText, 0, mainY);

  // sub line
  if (subText && activeTemplate !== "final") {
    ctx.font = subTpl.replace("{size}", subSize);
    const subY = Math.round(bannerSize * 0.42);
    ctx.fillText(subText.toUpperCase(), 0, subY);
  }

  ctx.restore();
  return bannerH;
}

function drawLogosLocked(W, H, bannerH) {
  const contentTop = bannerH + Math.round(H * 0.12);
  const logoSize = Math.round(Math.min(W, H) * 0.25);
  const logosY = contentTop;

  const homeToDraw = state.homeLogo || state.placeholderLogo;
  const awayToDraw = state.awayLogo || state.placeholderLogo;

  const homeCX = Math.round(W * (2 / 7));
  const awayCX = Math.round(W * (5 / 7));

  if (homeToDraw) drawFixedHeightCentered(homeToDraw, homeCX, logosY, 280, 1);
  if (awayToDraw) drawFixedHeightCentered(awayToDraw, awayCX, logosY, 280, 1);

  return { contentTop, logoSize, logosY };
}

function drawFooterBar(W, H, cx, text) {
  const footerH = Math.round(H * 0.09);
  const footerY = H - footerH;

  ctx.fillStyle = COLORS.blue;
  ctx.fillRect(0, footerY, W, footerH);

  const footerText = (text || " ").toUpperCase();
  const footerBaseSize = Math.round(Math.min(W, H) * 0.07 * FONT_SCALE);
  const footerTpl = `900 {size}px "Arial Narrow", system-ui`;
  const footerSize = fitText(
    footerText,
    Math.round(W * 0.95),
    footerBaseSize,
    16,
    footerTpl
  );

  ctx.fillStyle = COLORS.white;
  ctx.font = footerTpl.replace("{size}", footerSize);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(footerText, centeredX(footerText, cx), footerY + Math.round(footerH * 0.64));

  return { footerY, footerH };
}

function drawMatchupStackedCentered({
  centerX,
  y,
  maxWidth,
  home,
  away,
  vsPx = 56,
  gapPx = null,
}) {
  const fontFamily = `"Segoe UI", system-ui`;
  const base = Math.round(Math.min(canvas.width, canvas.height) * 0.12 * FONT_SCALE);
  const minSize = 18;

  const homeTpl = `900 {size}px ${fontFamily}`;
  const awayTpl = `900 {size}px ${fontFamily}`;
  const vsTpl = `900 {size}px ${fontFamily}`;

  const homeSize = fitText(home, maxWidth, base, minSize, homeTpl);
  const awaySize = fitText(away, maxWidth, base, minSize, awayTpl);
  const vsSize = Math.max(12, Math.round(vsPx));

  const lh = (s) => Math.ceil(s * 0.8);
  const gap = gapPx ?? vsSize;

  ctx.save();
  ctx.fillStyle = COLORS.white;
  ctx.textBaseline = "top";

  ctx.font = homeTpl.replace("{size}", homeSize);
  ctx.fillText(home, centeredX(home, centerX), y);

  const vsY = y + lh(homeSize) + gap;
  ctx.font = vsTpl.replace("{size}", vsSize);
  ctx.fillText("VS", centeredX("VS", centerX), vsY);

  const awayY = vsY + lh(vsSize) + gap;
  ctx.font = awayTpl.replace("{size}", awaySize);
  ctx.fillText(away, centeredX(away, centerX), awayY);

  ctx.restore();
  return awayY + lh(awaySize);
}

/* Templates */
function drawTemplateMatch(W, H, cx, bannerH, logosMeta) {
  const homeTeam = ((el("homeTeam")?.value || "")).trim() || "Hemmalag";
  const awayTeam = ((el("awayTeam")?.value || "")).trim() || "Bortalag";

  const titleY =
    logosMeta.contentTop + logosMeta.logoSize + Math.round(H * 0.08);
  const maxTitleWidth = Math.round(W * 0.82);

  drawMatchupStackedCentered({
    centerX: cx,
    y: titleY,
    maxWidth: maxTitleWidth,
    home: homeTeam.toUpperCase(),
    away: awayTeam.toUpperCase(),
  });

  const date = formatDate(el("date")?.value);
  const time = el("time")?.value || "";
  const venue = ((el("venue")?.value || "")).trim();
  const infoText = [date, time, venue].filter(Boolean).join(" • ");

  drawFooterBar(W, H, cx, infoText);
}

function drawTemplateFinal(W, H, cx, bannerH, logosMeta) {
  let hs = ((el("homeScore")?.value || "")).trim() || "0";
  let as = ((el("awayScore")?.value || "")).trim() || "0";

  if (currentMatch && currentMatch.result && currentMatch.result.trim() !== "") {
    const parts = currentMatch.result.trim().split(" - ");
    if (parts.length === 2) {
      hs = parts[0].trim() || "0";
      as = parts[1].trim() || "0";
    }
  }

  const scoreText = `${hs}-${as}`;

  const baseTop =
    logosMeta && typeof logosMeta.contentTop === "number" && typeof logosMeta.logoSize === "number"
      ? logosMeta.contentTop + logosMeta.logoSize
      : bannerH + Math.round(H * 0.22);

  const scoreY = baseTop + Math.round(H * 0.25);

  ctx.save();
  ctx.font = `900 ${SCORE_FONT_SIZE}px "Segoe UI", system-ui`;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";

  const textW = ctx.measureText(scoreText).width;
  const padY = Math.round(SCORE_FONT_SIZE * 0.16);

  const boxX = 0;
  const boxW = W;
  const boxH = Math.round(SCORE_FONT_SIZE + padY * 2);
  const boxY = Math.round(scoreY - padY);

  ctx.fillStyle = "rgba(244,242,238,0.65)";
  ctx.fillRect(boxX, boxY, boxW, boxH);

  const homeLogo = state.homeLogo || state.placeholderLogo;
  const awayLogo = state.awayLogo || state.placeholderLogo;

  const scoreLeftX = Math.round(cx - textW / 2);
  const smallLogo = Math.round(SCORE_FONT_SIZE * 0.62);
  const logoGap = Math.round(SCORE_FONT_SIZE * 0.25);
  const logoY = Math.round(boxY + (boxH - smallLogo) / 2);

  const hsW = ctx.measureText(String(hs)).width;
  const sepW = ctx.measureText("–").width;
  const asW = ctx.measureText(String(as)).width;

  const homeLogoX = Math.round(scoreLeftX - logoGap - smallLogo);
  const awayLogoX = Math.round(scoreLeftX + hsW + sepW + asW + logoGap);

  if (homeLogo) drawCover(homeLogo, homeLogoX, logoY, smallLogo, smallLogo, 1);
  if (awayLogo) drawCover(awayLogo, awayLogoX, logoY, smallLogo, smallLogo, 1);

  ctx.fillStyle = COLORS.blue;
  ctx.fillText(scoreText, Math.round(cx - textW / 2), scoreY);

  const listY = boxY + boxH + SCORERS_TOP_GAP;
  const msg = ((el("finalMessage")?.value || "")).trim();

  if (msg) {
    const msgTpl = `800 {size}px "Segoe UI", system-ui`;
    const msgBase = Math.round(Math.min(W, H) * 0.06);
    const msgSize = fitText(msg, Math.round(W * 0.92), msgBase, 18, msgTpl);

    ctx.fillStyle = COLORS.white;
    ctx.font = msgTpl.replace("{size}", msgSize);
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(msg, cx, Math.round(listY * 1.08));

    ctx.restore();
    return;
  }

  const homeLines = getScorerLinesFromGrid("home");
  const awayLines = getScorerLinesFromGrid("away");

  const homeCenterX = Math.round(W * 0.12);
  const awayCenterX = Math.round(W * 0.58);
  const lineH = SCORERS_FONT_SIZE + SCORERS_LINE_GAP;

  ctx.fillStyle = COLORS.white;
  ctx.font = `700 ${SCORERS_FONT_SIZE}px "Segoe UI", system-ui`;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";

  for (let i = 0; i < SCORERS_MAX_ROWS; i++) {
    const y = listY + i * lineH;
    if (homeLines[i]) ctx.fillText(homeLines[i], homeCenterX, y);
    if (awayLines[i]) ctx.fillText(awayLines[i], awayCenterX, y);
  }

  ctx.restore();
}

function drawTemplateSigning(W, H, cx) {
  const xLeft = Math.round(W * 0.06);
  const maxW = Math.round(W * 0.9);

  const numberRaw = ((el("playerNumber")?.value || "")).trim();
  const number = numberRaw ? `#${numberRaw}` : "";

  const first = ((el("playerFirstName")?.value || "")).trim().toUpperCase();
  const last = ((el("playerLastName")?.value || "")).trim().toUpperCase();

  let lineTop = "";
  let lineBottom = "";

  if (first && last) {
    lineTop = first;
    lineBottom = last;
  } else {
    lineBottom = (first || last || "NY SPELARE");
  }

  drawCover(state.signingBg, 0, 0, W, H);

  const topPad = Math.round(H * 0.06);

  const title = "NYFÖRVÄRV";
  const titleTpl = `900 {size}px "Segoe UI", system-ui`;
  const titleBase = Math.round(H * 0.11 * FONT_SCALE);
  const titleSize = fitText(title, maxW, titleBase, 18, titleTpl);

  ctx.save();
  ctx.fillStyle = COLORS.white;
  ctx.font = titleTpl.replace("{size}", titleSize);
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(title, xLeft, topPad);
  ctx.restore();

  const titleGap = Math.round(H * 0.02);
  const logoSize = 172;

  const logoY = topPad + Math.round(titleSize * 0.96) + titleGap;
  if (state.sifLogo) drawCover(state.sifLogo, xLeft + 40, logoY, logoSize, logoSize);

  const blockY = logoY + logoSize + Math.round(H * 0.03);

  const ovalW = Math.round(W * 1.06);
  const ovalH = Math.round(H * 0.96);
  const ovalX = Math.round(W * 0.24);
  const ovalY = Math.round(blockY - H * 0.15);

  const frameW = Math.max(8, Math.round(Math.min(W, H) * 0.008));
  drawOvalFramed(state.playerImage, ovalX, ovalY, ovalW, ovalH, COLORS.blue, frameW);

  ctx.save();
  ctx.fillStyle = COLORS.white;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";

  const nameTpl = `900 {size}px "Segoe UI", system-ui`;
  const nameBase = Math.round(Math.min(W, H) * 0.16 * FONT_SCALE);

  let size = nameBase;
  while (size >= 18) {
    ctx.font = nameTpl.replace("{size}", size);
    const w1 = ctx.measureText(lineTop || " ").width;
    const w2 = ctx.measureText(lineBottom || " ").width;
    if (Math.max(w1, w2) <= maxW) break;
    size -= 2;
  }

  ctx.font = nameTpl.replace("{size}", size);

  const gap = Math.min(22, Math.round(size * 0.18));
  const lh = Math.round(size * 0.95);

  const bottomPad = Math.round(H * 0.05);
  const totalH = lineTop ? (lh + gap + lh) : lh;
  const nameTopY = Math.round(H - bottomPad - totalH);

  const padTop = 6;
  const padBottom = 1;
  const padRight = 24;

  if (lineTop) drawNameLineWithBg(lineTop, xLeft, nameTopY, size, padTop, padBottom, padRight);
  drawNameLineWithBg(lineBottom, xLeft, nameTopY + (lineTop ? (lh + gap) : 0), size, padTop, padBottom, padRight);

  ctx.restore();

  const numSize = Math.round(H * 0.06);
  const numGap = Math.min(26, Math.max(10, Math.round(numSize * 0.45)));
  const numY = Math.round(nameTopY - numGap - numSize);

  ctx.save();
  ctx.fillStyle = COLORS.white;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.font = `900 ${numSize}px "Times New Roman", serif`;
  if (number) ctx.fillText(number, xLeft, numY);
  ctx.restore();
}

function drawTemplateAnnouncement(W, H, cx) {
  const title = ((el("announceTitle")?.value || "")).trim() || "MEDDELANDE";
  const subtitle = ((el("announceSubtitle")?.value || "")).trim();
  const body = ((el("announceBody")?.value || "")).trim() || "Skriv din text här…";
  const footerText = ((el("announceFooter")?.value || "")).trim() || "laget.se/satersiffk";
  const footerColorKey = ((el("announceFooterColor")?.value || "blue")).trim().toLowerCase();
  const footerColor = COLORS[footerColorKey] || COLORS.blue;

  const xLeft = Math.round(W * 0.06);
  const maxW = Math.round(W * 0.9);
  const topPad = Math.round(H * 0.06);

  const titleTpl = `900 {size}px "Segoe UI", system-ui`;
  const titleBase = Math.round(H * 0.09 * FONT_SCALE);
  const titleText = title.toUpperCase();
  const titleSize = fitText(titleText, maxW, titleBase, 18, titleTpl);

  const subtitleTpl = `700 {size}px "Segoe UI", system-ui`;
  const subtitleBase = Math.max(14, Math.round(titleSize * 0.46));
  const subtitleText = subtitle;
  const subtitleSize = subtitleText
    ? fitText(subtitleText, maxW, subtitleBase, 12, subtitleTpl)
    : 0;

  const lineGap = subtitleText ? Math.max(4, Math.round(titleSize * 0.08)) : 0;
  const blockPadTop = Math.max(6, Math.round(H * 0.008));
  const blockPadBottom = Math.max(6, Math.round(H * 0.008));

  const textHeight = Math.round(
    titleSize + (subtitleText ? lineGap + subtitleSize : 0)
  );
  const blockH = Math.round(textHeight + blockPadTop + blockPadBottom);

  ctx.save();
  ctx.fillStyle = COLORS.blue;
  ctx.fillRect(0, topPad - blockPadTop, W, blockH);

  ctx.fillStyle = COLORS.white;
  ctx.font = titleTpl.replace("{size}", titleSize);
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText(titleText, Math.round(W / 2), topPad);

  if (subtitleText) {
    ctx.font = subtitleTpl.replace("{size}", subtitleSize);
    const subtitleY = topPad + titleSize + lineGap;
    ctx.fillText(subtitleText, Math.round(W / 2), subtitleY);
  }

  const bodyTpl = `700 {size}px "Segoe UI", system-ui`;
  const bodySize = Math.round(Math.min(W, H) * 0.045 * FONT_SCALE);
  ctx.font = bodyTpl.replace("{size}", bodySize);

  const bodyMaxW = Math.round(W * 0.86);
  const lines = wrapLines(body, bodyMaxW);
  const lh = Math.round(bodySize * 1.25);

  ctx.textAlign = "left";
  let y = topPad + blockH + Math.max(10, Math.round(H * 0.02));
  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    const line = lines[i];
    ctx.fillText(line, xLeft, y);
    y += lh;
  }

  if (state.sifLogo) {
    const logoH = Math.min(172, Math.round(H * 0.2));
    const logoW = Math.round(logoH * (state.sifLogo.width / state.sifLogo.height));
    const logoX = Math.round(W * 0.06);
    const logoY = Math.round(H * 0.96 - logoH);
    drawCover(state.sifLogo, logoX, logoY, logoW, logoH, 1);
  }

  const ribbonH = Math.max(54, Math.round(H * 0.08));
  const ribbonW = Math.max(300, Math.round(W * 0.72));
  const ribbonAngle = (-28 * Math.PI) / 180;

  const footerTpl = `900 {size}px "Arial Narrow", system-ui`;
  const footerBase = Math.round(Math.min(W, H) * 0.05 * FONT_SCALE);
  const footerSize = fitText(footerText.toUpperCase(), Math.round(ribbonW * 0.7), footerBase, 14, footerTpl);
  const offsetX = Math.round(W * 0.005);
  const offsetY = Math.round(H * 0.19);

  ctx.save();
  ctx.translate(W - offsetX, H - offsetY);
  ctx.rotate(ribbonAngle);

  ctx.fillStyle = footerColor;
  ctx.fillRect(-ribbonW, -ribbonH, ribbonW + Math.round(W * 0.06), ribbonH + Math.round(H * 0.02));

  ctx.fillStyle = COLORS.white;
  ctx.font = footerTpl.replace("{size}", footerSize);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(footerText, -Math.round(ribbonW * 0.36), -Math.round(ribbonH * 0.40));
  ctx.restore();

  ctx.restore();
}

const TEMPLATES = {
  match: {
    banner: () => ((el("bannerText")?.value || "")).trim() || "MATCHDAG",
    draw: (W, H, cx, bannerH, logosMeta) =>
      drawTemplateMatch(W, H, cx, bannerH, logosMeta),
  },
  final: {
    banner: () => "SLUTRESULTAT",
    draw: (W, H, cx, bannerH, logosMeta) =>
      drawTemplateFinal(W, H, cx, bannerH, logosMeta),
  },
  signing: {
    banner: () => "NYFÖRVÄRV",
    draw: (W, H, cx) => drawTemplateSigning(W, H, cx),
  },
  announce: {
    banner: () => "NYHET",
    draw: (W, H, cx) => drawTemplateAnnouncement(W, H, cx),
  },
};

/* Main draw */
function draw() {
  setCanvasSizeFromFormat();
  const W = canvas.width;
  const H = canvas.height;
  const cx = Math.round(W / 2);

  drawBase(W, H);

  if (activeTemplate === "signing" || activeTemplate === "announce") {
    TEMPLATES[activeTemplate].draw(W, H, cx);
    el("downloadBtn").disabled = false;
    return;
  }

  const bannerText = TEMPLATES[activeTemplate]?.banner?.() || "MATCHDAG";
  const bannerH = drawBanner(W, H, cx, bannerText);

  const needsLogos = activeTemplate === "match";
  const logosMeta = needsLogos ? drawLogosLocked(W, H, bannerH) : null;

  TEMPLATES[activeTemplate].draw(W, H, cx, bannerH, logosMeta);
  el("downloadBtn").disabled = false;
}

/* Tabs */
function updateTemplateFields(template) {
  document.querySelectorAll(".templateFields").forEach((box) => {
    const t1 = box.dataset.template;
    const t2 = box.dataset.templateAlt;
    const t3 = box.dataset.templateAlt2;
    box.style.display = (t1 === template || t2 === template || t3 === template) ? "" : "none";
  });
}

function bindTabs() {
  const tabs = document.querySelectorAll(".tab[data-template]");
  if (!tabs.length) return;

  tabs.forEach((btn) => {
    btn.addEventListener("click", async () => {
      const t = btn.dataset.template;
      if (!TEMPLATES[t]) return;

      activeTemplate = t;

      if (activeTemplate !== "final") {
        const fb = el("finalBackground");
        if (fb) fb.value = "";
        state.finalBg = null;
      }

      if (activeTemplate === "signing") await ensureSigningBg();

      tabs.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      updateTemplateFields(activeTemplate);
      ensureBackgroundSelectPopulated();
      await applySelectedBackground();
      draw();
    });
  });

  updateTemplateFields(activeTemplate);
}

/* Events */
el("renderBtn")?.addEventListener("click", async () => {
  try {
    await handleFiles();
    if (el("bgSelect")) await applySelectedBackground();
    draw();
  } catch (e) {
    console.error(e);
    draw();
  }
});

el("downloadBtn")?.addEventListener("click", () => {
  const { label, w, h } = getSelectedFormat();
  canvas.toBlob(
    (blob) => {
      if (!blob) return;
      const filename = `kort_${activeTemplate}_${slugify(label)}_${w}x${h}.png`;
      const a = document.createElement("a");
      const url = URL.createObjectURL(blob);
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    },
    "image/png"
  );
});

el("homeLogo")?.addEventListener("change", async () => {
  await handleFiles();
  draw();
});

el("awayLogo")?.addEventListener("change", async () => {
  await handleFiles();
  draw();
});

el("homeTeam")?.addEventListener("input", async () => {
  await autoLoadHomeLogo();
  draw();
});

el("awayTeam")?.addEventListener("input", async () => {
  await autoLoadAwayLogo();
  draw();
});

el("league")?.addEventListener("input", () => {
  state.trimmedLeague = (el("league")?.value || "").trim();
  draw();
});
el("round")?.addEventListener("change", () => draw());
el("venue")?.addEventListener("input", () => draw());
el("homeScore")?.addEventListener("input", () => draw());
el("awayScore")?.addEventListener("input", () => draw());
el("finalMessage")?.addEventListener("input", () => draw());
el("format")?.addEventListener("change", () => draw());

el("bgSelect")?.addEventListener("change", async () => {
  await applySelectedBackground();
  draw();
});

el("finalBackground")?.addEventListener("change", async () => {
  await handleFiles();
  draw();
});

el("resetBtn")?.addEventListener("click", () => {
  location.reload();
});

document.querySelectorAll(".scorersGrid").forEach((box) => {
  box.addEventListener("input", () => draw());
});

document.addEventListener(
  "blur",
  (e) => {
    if (e.target?.classList?.contains("scorerMin")) {
      e.target.value = normalizeMinutes(e.target.value);
      draw();
    }
  },
  true
);

["playerFirstName", "playerLastName", "playerNumber"].forEach((id) => {
  el(id)?.addEventListener("input", () => draw());
});

["announceTitle", "announceSubtitle", "announceBody", "announceFooter"].forEach((id) => {
  el(id)?.addEventListener("input", () => draw());
});

el("announceFooterColor")?.addEventListener("change", () => draw());

el("playerImage")?.addEventListener("change", async () => {
  await handleFiles();
  draw();
});

/* Init */
(async () => {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  if (el("date")) el("date").value = `${yyyy}-${mm}-${dd}`;

  ensureBackgroundSelectPopulated();
  if (el("bgSelect")) await applySelectedBackground();

  await handleFiles();
  await autoLoadHomeLogo();
  await autoLoadAwayLogo();
  await ensureSigningBg();
  await ensureSifLogo();

  try {
    const response = await fetch("assets/csv/matcher.csv");
    if (response.ok) {
      const text = await response.text();
      csvMatches = parseMatchesFromYourCSV(text);
      fillMatchSelect(csvMatches);
    }
  } catch (e) {
    console.warn("Kunde inte ladda matcher.csv:", e);
  }

  if (document.fonts?.ready) {
    try {
      await document.fonts.ready;
    } catch (_) { }
  }

  bindTabs();
  requestAnimationFrame(() => draw());
})();