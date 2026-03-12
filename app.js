const el = (id) => document.getElementById(id);

const canvas = el("card");
const ctx = canvas.getContext("2d");

const state = {
  homeLogo: null,
  awayLogo: null,
  placeholderLogo: null,
  bg: null,
  bgMode: "preset",
};

const COLORS = {
  blue: "#013888",
  black: "#000000",
  white: "#FFFFFF",
  offwhite: "#F6F8FB",
};

function getSelectedFormat() {
  const select = el("format");
  const [w, h] = select.value.split("x").map(Number);
  const label = select.options[select.selectedIndex].text;
  return { w, h, label };
}

function slugify(s) {
  return s
    .toLowerCase()
    .replace(/å/g, "a")
    .replace(/ä/g, "a")
    .replace(/ö/g, "o")
    .replace(/[^\w]+/g, "_")
    .replace(/^_+|_+$/g, "");
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

/**
 * Valbara bakgrunder (assets/bg/...)
 * Om du lägger till <select id="bgSelect"></select> i HTML så fylls den automatiskt.
 */
const BACKGROUNDS = [
  { id: "bg1", label: "Tröja", url: "assets/bg/shirt.png" },
  { id: "bg2", label: "Gräs", url: "assets/bg/green_grass.png" },
  { id: "bg3", label: "Bakgrund 3", url: "assets/bg/bg3.jpg" },
  { id: "none", label: "Ingen bakgrund", url: "" },
];

function ensureBackgroundSelectPopulated() {
  const sel = el("bgSelect");
  if (!sel) return;
  if (sel.options && sel.options.length > 0) return;

  for (const bg of BACKGROUNDS) {
    const opt = document.createElement("option");
    opt.value = bg.id;
    opt.textContent = bg.label;
    sel.appendChild(opt);
  }
  sel.value = "bg1";
}

async function applySelectedBackground() {
  const sel = el("bgSelect");
  if (!sel) return;

  const choice = sel.value;
  const bg = BACKGROUNDS.find((b) => b.id === choice);

  if (!bg || !bg.url) {
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

async function handleFiles() {
  // Hemmalogga: default (laddas en gång)
  if (!state.homeLogo) {
    try {
      state.homeLogo = await loadImageFromURL("assets/logo/siffk.png");
    } catch (e) {
      console.warn("Kunde inte ladda assets/logo/siffk.png", e);
      state.homeLogo = null;
    }
  }

  // Placeholder för bortalag: default (laddas en gång)
  if (!state.placeholderLogo) {
    try {
      state.placeholderLogo = await loadImageFromURL("assets/logo/placeholder.png");
    } catch (e) {
      console.warn("Kunde inte ladda assets/logo/placeholder.png", e);
      state.placeholderLogo = null;
    }
  }

  // Bortalogga uppladdning (om du fortfarande har <input id="awayLogo">)
  const awayFile = el("awayLogo")?.files?.[0];
  state.awayLogo = await loadFileImage(awayFile);
}

function formatDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("sv-SE", { weekday: "short", day: "2-digit", month: "short" });
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

function fitText(ctx, text, maxWidth, startSize, weight = 800) {
  let size = startSize;
  while (size > 14) {
    ctx.font = `${weight} ${size}px Inter, system-ui`;
    if (ctx.measureText(text).width <= maxWidth) return size;
    size -= 2;
  }
  return size;
}

function centeredX(text, weight, size, centerX) {
  const w = ctx.measureText(text).width;
  return Math.round(centerX - w / 2);
}

function roundRectPath(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function fillRoundRect(ctx, x, y, w, h, r, fillStyle = "rgba(255,255,255,0.35)") {
  ctx.save();
  ctx.fillStyle = fillStyle;
  roundRectPath(ctx, x, y, w, h, r);
  ctx.fill();
  ctx.restore();
}

function fillTextWithOutline(text, x, y, fill = "#fff", outline = "#000", outlineWidth = 6) {
  ctx.save();
  ctx.lineJoin = "round";
  ctx.miterLimit = 2;
  ctx.strokeStyle = outline;
  ctx.lineWidth = outlineWidth;
  ctx.strokeText(text, x, y);   // svart kontur
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);     // vit text ovanpå
  ctx.restore();
}

/**
 * Matchup med symmetrisk spacing:
 * HOME
 * (gap)
 * VS
 * (gap)
 * AWAY
 *
 * VS får samma avstånd upp och ner.
 */
function drawMatchupStackedCentered({ centerX, y, maxWidth, home, away, lineGap = 0.22 }) {
  const base = Math.round(Math.min(canvas.width, canvas.height) * 0.11);

  const homeSize = fitText(ctx, home, maxWidth, base, 900);
  const awaySize = fitText(ctx, away, maxWidth, base, 900);
  const mainSize = Math.min(homeSize, awaySize);
  const vsSize = Math.round(mainSize * 0.7);
  const lh = Math.round(mainSize * (1 + lineGap));

  // HOME (vit text med svart kontur)
  ctx.font = `900 ${homeSize}px Inter, system-ui`;
  fillTextWithOutline(
    home,
    centeredX(home, 900, homeSize, centerX),
    y,
    "#FFFFFF",
    "#000000",
    Math.max(4, Math.round(homeSize * 0.1))
  );

  // VS (vit text med svart kontur)
  const vsY = y + lh;
  ctx.font = `900 ${vsSize}px Inter, system-ui`;
  fillTextWithOutline(
    "VS",
    centeredX("VS", 900, vsSize, centerX),
    vsY,
    "#FFFFFF",
    "#000000",
    Math.max(4, Math.round(vsSize * 0.12))
  );

  // AWAY (vit text med svart kontur)
  const awayY = vsY + lh;
  ctx.font = `900 ${awaySize}px Inter, system-ui`;
  fillTextWithOutline(
    away,
    centeredX(away, 900, awaySize, centerX),
    awayY,
    "#FFFFFF",
    "#000000",
    Math.max(4, Math.round(awaySize * 0.1))
  );

  return awayY;

}

function drawBackdropPanel(x, y, w, h) {
  ctx.save();
  ctx.fillStyle = "rgba(255,255,255,0.72)";
  ctx.fillRect(x, y, w, h);
  ctx.restore();
}

function draw() {
  setCanvasSizeFromFormat();

  const W = canvas.width;
  const H = canvas.height;

  const homeTeam = ((el("homeTeam")?.value) || "").trim() || "Hemmalag";
  const awayTeam = ((el("awayTeam")?.value) || "").trim() || "Bortalag";

  const date = formatDate(el("date")?.value);
  const time = el("time")?.value || "";
  const venue = ((el("venue")?.value) || "").trim() || "";

  const cx = Math.round(W / 2);

  // ===== HELA YTAN (ingen ram / inget kort) =====
  ctx.clearRect(0, 0, W, H);

  // Bas
  ctx.fillStyle = COLORS.offwhite;
  ctx.fillRect(0, 0, W, H);

  // Bakgrundsbild (valbar via bgSelect)
  if (state.bg) {
    drawCover(state.bg, 0, 0, W, H, 1);
  }

  // ===== BANNER TOPP (full bredd) =====
  const bannerH = Math.round(H * 0.16);
  ctx.fillStyle = COLORS.blue;
  ctx.fillRect(0, 0, W, bannerH);

  const bannerText = "MATCHDAG";
  const bannerSize = Math.round(Math.min(W, H) * 0.13);
  ctx.fillStyle = COLORS.white;
  ctx.font = `900 ${bannerSize}px Inter, system-ui`;
  ctx.fillText(bannerText, centeredX(bannerText, 900, bannerSize, cx), Math.round(bannerH * 0.68));

  // ===== LOGGOR (låsta positioner) =====
  const contentTop = bannerH + Math.round(H * 0.06);

  const logoSize = Math.round(Math.min(W, H) * 0.25);
  const logosY = contentTop;

  // Låsta centers (justera här vid behov)
  const homeCenterX = Math.round(W * 0.30);
  const awayCenterX = Math.round(W * 0.70);

  const homeLogoX = Math.round(homeCenterX - logoSize / 2);
  const awayLogoX = Math.round(awayCenterX - logoSize / 2);

  // Rita logos
  if (state.homeLogo) {
    drawCover(state.homeLogo, homeLogoX, logosY, logoSize, logoSize, 1);
  }

  const awayToDraw = state.awayLogo || state.placeholderLogo;
  if (awayToDraw) {
    drawCover(awayToDraw, awayLogoX, logosY, logoSize, logoSize, 1);
  }

  // ===== MATCHUP =====
  const titleY = contentTop + logoSize + Math.round(H * 0.1);
  const maxTitleWidth = Math.round(W * 0.82);

  const titleBottomY = drawMatchupStackedCentered({
    centerX: cx,
    y: titleY,
    maxWidth: maxTitleWidth,
    home: homeTeam.toUpperCase(),
    away: awayTeam.toUpperCase(),
  });

  // Underline
  ctx.save();
  ctx.strokeStyle = "rgba(1,56,136,1)";
  ctx.lineWidth = Math.max(6, Math.round(Math.min(W, H) * 0.005));
  const ulW = Math.round(maxTitleWidth * 0.9);
  const ulY = titleBottomY + Math.round(H * 0.035);
  ctx.beginPath();
  ctx.moveTo(cx - ulW / 2, ulY);
  ctx.lineTo(cx + ulW / 2, ulY);
  ctx.stroke();
  ctx.restore();

  const infoParts = [date, time, venue].filter(Boolean);
  const infoText = infoParts.join("  •  ");

  // ===== FOOTER (full bredd) =====
  const footerH = Math.round(H * 0.10);
  const footerY = H - footerH;

  ctx.fillStyle = COLORS.blue;
  ctx.fillRect(0, footerY, W, footerH);

  const footerText = infoText || " ";
  const footerSize = Math.round(Math.min(W, H) * 0.045);

  ctx.fillStyle = COLORS.white;
  ctx.font = `900 ${footerSize}px Inter, system-ui`;
  ctx.fillText(footerText, centeredX(footerText, 900, footerSize, cx), footerY + Math.round(footerH * 0.64));

  el("downloadBtn").disabled = false;
}

// ===== Events =====
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

  canvas.toBlob((blob) => {
    if (!blob) return;

    const filename = `matchkort_${slugify(label)}_${w}x${h}.png`;

    const a = document.createElement("a");
    const url = URL.createObjectURL(blob);
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }, "image/png");
});

el("format")?.addEventListener("change", () => draw());

el("bgSelect")?.addEventListener("change", async () => {
  await applySelectedBackground();
  draw();
});

// Init
(async () => {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  if (el("date")) el("date").value = `${yyyy}-${mm}-${dd}`;

  ensureBackgroundSelectPopulated();
  if (el("bgSelect")) await applySelectedBackground();

  // Viktigt: ladda logos (inkl placeholder) innan första draw
  await handleFiles();
  await document.fonts.ready;
  draw();
})();