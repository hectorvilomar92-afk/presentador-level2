// Construcción del archivo PowerPoint con PptxGenJS (recibe la clase para poder probarlo en Node).

const NAVY = "0A2A5E";
const ORO = "D4AF37";
const GRIS = "333333";
const CLARO = "BFD3F2";
const W = 13.333;
const H = 7.5;
const FUENTE = "Calibri";

function ajustar(img, bw, bh) {
  const e = Math.min(bw / img.w, bh / img.h);
  return { w: img.w * e, h: img.h * e };
}

function poner(slide, img, autor, x, y, bw, bh, colorCap) {
  const d = ajustar(img, bw, bh);
  slide.addImage({ data: img.data, x: x + (bw - d.w) / 2, y, w: d.w, h: d.h });
  slide.addText(`Imagen: ${autor}`, {
    x, y: y + d.h + 0.05, w: bw, h: 0.3, fontSize: 10, align: "center",
    color: colorCap || "777777", fontFace: FUENTE,
  });
}

function barra(pptx, slide, texto) {
  slide.background = { color: "FFFFFF" };
  slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: W, h: 1.15, fill: { color: NAVY }, line: { color: NAVY } });
  slide.addShape(pptx.ShapeType.rect, { x: 0, y: 1.15, w: W, h: 0.06, fill: { color: ORO }, line: { color: ORO } });
  slide.addText(texto, {
    x: 0.5, y: 0.1, w: W - 1, h: 0.95, bold: true, color: "FFFFFF", fontFace: FUENTE,
    valign: "middle", fontSize: texto.length > 45 ? 24 : 30,
  });
}

function mayuscula(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function tamanoTexto(puntos) {
  const total = puntos.reduce((n, p) => n + p.length, 0);
  if (total > 950) return 15;
  if (total > 800) return 16;
  if (total > 650) return 17;
  if (total > 450) return 18;
  return 20;
}

export function construirPptx(PptxGenJS, { tema, slides, fuentes, portada, portadaImg, incluirYT }) {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.title = tema;
  pptx.author = "PLANI PRESENTACION LEVEL";

  // Portada
  const titulo = mayuscula(tema);
  let s = pptx.addSlide();
  s.background = { color: NAVY };
  s.addText(titulo, {
    x: 0.7, y: 1.9, w: portadaImg ? 7 : 11.9, h: 2.5, bold: true, color: "FFFFFF", fontFace: FUENTE,
    valign: "middle", fontSize: titulo.length > 40 ? 34 : 46,
  });
  s.addShape(pptx.ShapeType.rect, { x: 0.7, y: 4.55, w: 1.6, h: 0.07, fill: { color: ORO }, line: { color: ORO } });
  s.addText("Presentación educativa", { x: 0.7, y: 4.75, w: 7, h: 0.5, fontSize: 20, color: CLARO, fontFace: FUENTE });
  if (portadaImg && portada) poner(s, portadaImg, portada.autor, 8.0, 1.3, 4.8, 4.8, CLARO);

  // Contenido
  for (const d of slides) {
    s = pptx.addSlide();
    barra(pptx, s, d.titulo);
    const conImg = !!d.img;
    s.addText(
      d.puntos.map((p) => ({ text: p, options: { bullet: true, breakLine: true, paraSpaceAfter: 10 } })),
      {
        x: 0.5, y: 1.5, w: conImg ? 7.4 : 12.3, h: 5.4, valign: "top",
        fontSize: tamanoTexto(d.puntos), color: GRIS, fontFace: FUENTE,
      },
    );
    if (conImg) poner(s, d.img, d.imagen.autor, 8.2, 1.6, 4.7, 4.8);
    s.slideNumber = { x: W - 0.9, y: H - 0.4, fontSize: 10, color: "888888" };
  }

  // Fuentes
  s = pptx.addSlide();
  barra(pptx, s, "Fuentes y referencias");
  const vistos = new Set();
  const runs = [];
  for (const f of fuentes) {
    const clave = f.nombre + "|" + f.url;
    if (vistos.has(clave) || vistos.size >= 12) continue;
    vistos.add(clave);
    if (f.url) {
      runs.push({ text: f.nombre + " — ", options: { breakLine: false } });
      runs.push({ text: f.url, options: { hyperlink: { url: f.url }, breakLine: true } });
    } else {
      runs.push({ text: f.nombre, options: { breakLine: true } });
    }
  }
  s.addText(runs, { x: 0.5, y: 1.5, w: 12.3, h: 5.6, valign: "top", fontSize: 13, color: GRIS, fontFace: FUENTE, paraSpaceAfter: 6 });

  if (incluirYT) {
    s = pptx.addSlide();
    barra(pptx, s, "Videos recomendados en YouTube");
    const q = encodeURIComponent(tema).replace(/%20/g, "+");
    const enlaces = [
      ["Explicación del tema", `https://www.youtube.com/results?search_query=${q}`],
      ["Clases y tutoriales", `https://www.youtube.com/results?search_query=${q}+clase+educativa`],
    ];
    const items = [];
    for (const [nombre, url] of enlaces) {
      items.push({ text: nombre + ": ", options: { breakLine: false } });
      items.push({ text: url, options: { hyperlink: { url }, breakLine: true } });
    }
    s.addText(items, { x: 0.5, y: 1.6, w: 12.3, h: 3, valign: "top", fontSize: 16, color: GRIS, fontFace: FUENTE, paraSpaceAfter: 12 });
  }

  return pptx;
}
