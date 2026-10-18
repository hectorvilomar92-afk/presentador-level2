// Búsqueda de información real y armado del contenido de la presentación.
// No depende del navegador (solo de fetch), así que también se puede probar en Node.

const SECCIONES_IGNORADAS = new Set([
  "referencias", "véase también", "enlaces externos", "notas", "bibliografía",
  "further reading", "references", "see also", "external links", "notes",
  "bibliography", "citas", "galería", "gallery", "sources", "fuentes",
]);

const qs = (o) => new URLSearchParams(o).toString();

export async function fetchJson(url, ms = 9000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctl.signal });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

function limpiarHtml(s) {
  return String(s || "")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .trim();
}

export async function wikiBuscar(consulta, lang, limite = 5, f = fetchJson) {
  try {
    const d = await f(`https://${lang}.wikipedia.org/w/api.php?` + qs({
      action: "query", list: "search", srsearch: consulta,
      srlimit: limite, format: "json", origin: "*",
    }));
    return d.query.search.map((x) => x.title);
  } catch {
    return [];
  }
}

export async function wikiPagina(titulo, lang, f = fetchJson) {
  try {
    const d = await f(`https://${lang}.wikipedia.org/w/api.php?` + qs({
      action: "query", prop: "extracts|pageimages|info", titles: titulo,
      explaintext: 1, exsectionformat: "wiki", piprop: "thumbnail",
      pithumbsize: 900, inprop: "url", redirects: 1, format: "json", origin: "*",
    }));
    const page = Object.values(d.query.pages)[0];
    if (!page || !page.extract) return null;
    return {
      titulo: page.title,
      texto: page.extract,
      url: page.fullurl || "",
      imagen: (page.thumbnail && page.thumbnail.source) || null,
      lang,
    };
  } catch {
    return null;
  }
}

export async function commonsImagenes(consulta, limite = 6, f = fetchJson) {
  try {
    const d = await f("https://commons.wikimedia.org/w/api.php?" + qs({
      action: "query", generator: "search", gsrnamespace: 6,
      gsrsearch: consulta, gsrlimit: limite, prop: "imageinfo",
      iiprop: "url|mime|extmetadata", iiurlwidth: 900, format: "json", origin: "*",
    }));
    const out = [];
    for (const p of Object.values((d.query && d.query.pages) || {})) {
      const info = (p.imageinfo || [])[0] || {};
      if (!["image/jpeg", "image/png"].includes(info.mime)) continue;
      const url = info.thumburl || info.url;
      if (!url) continue;
      const autor = limpiarHtml(info.extmetadata && info.extmetadata.Artist && info.extmetadata.Artist.value).slice(0, 60);
      out.push({ url, pagina: info.descriptionurl || "", autor: autor || "Wikimedia Commons" });
    }
    return out;
  } catch {
    return [];
  }
}

export async function openalexArticulos(consulta, limite = 3, f = fetchJson) {
  try {
    const d = await f("https://api.openalex.org/works?" + qs({
      search: consulta, per_page: limite, select: "title,publication_year,doi",
    }));
    return (d.results || [])
      .filter((w) => w.title)
      .map((w) => ({ nombre: `${limpiarHtml(w.title)} (${w.publication_year || "s.f."})`, url: w.doi || "" }));
  } catch {
    return [];
  }
}

export async function openlibraryLibros(consulta, limite = 3, f = fetchJson) {
  try {
    const d = await f("https://openlibrary.org/search.json?" + qs({
      q: consulta, limit: limite, fields: "title,author_name,first_publish_year,key",
    }));
    return (d.docs || []).map((x) => ({
      nombre: `${x.title} — ${(x.author_name || []).slice(0, 2).join(", ") || "Autor desconocido"} (${x.first_publish_year || "s.f."})`,
      url: `https://openlibrary.org${x.key}`,
    }));
  } catch {
    return [];
  }
}

export function parsearSecciones(texto) {
  const secciones = [];
  let titulo = "Introducción";
  let buf = [];
  for (let linea of texto.split("\n")) {
    linea = linea.trim();
    const m = linea.match(/^(={2,})\s*(.+?)\s*\1$/);
    if (m) {
      if (m[1].length === 2) {
        if (buf.length) secciones.push([titulo, buf.join(" ")]);
        titulo = m[2];
        buf = [];
      }
      continue;
    }
    if (linea) buf.push(linea);
  }
  if (buf.length) secciones.push([titulo, buf.join(" ")]);
  return secciones.filter(([t]) => !SECCIONES_IGNORADAS.has(t.toLowerCase()));
}

export function puntosClave(texto, maximo = 4) {
  const limpio = texto.replace(/\[\d+\]|\[[a-z]\]/g, "");
  const frases = limpio.split(/(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÑ¿¡0-9])/);
  return frases.map((s) => s.trim()).filter((s) => s.length >= 40 && s.length <= 260).slice(0, maximo);
}

/**
 * Reúne contenido real de varias fuentes.
 * Devuelve { tema, slides, fuentes, portada } o null si no hay información suficiente.
 */
export async function recopilar(tema, nSlides, f = fetchJson) {
  let pagina = null;
  for (const lang of ["es", "en"]) {
    const titulos = await wikiBuscar(tema, lang, 5, f);
    for (const t of titulos) {
      const p = await wikiPagina(t, lang, f);
      if (p && p.texto.length > 400) { pagina = p; break; }
    }
    if (pagina) break;
  }
  if (!pagina) return null;

  const fuentes = [{ nombre: `Wikipedia (${pagina.lang}): ${pagina.titulo}`, url: pagina.url }];

  // Fuentes académicas y libros: se piden en paralelo mientras se arma el resto.
  const pExtras = Promise.all([openalexArticulos(tema, 3, f), openlibraryLibros(tema, 3, f)]);

  // Diapositivas desde las secciones reales del artículo
  const slides = [];
  for (const [titulo, texto] of parsearSecciones(pagina.texto)) {
    const puntos = puntosClave(texto);
    if (puntos.length) slides.push({ titulo, puntos, imagen: null });
    if (slides.length >= nSlides) break;
  }

  // Si faltan, completar con artículos relacionados
  if (slides.length < nSlides) {
    const usados = new Set([pagina.titulo]);
    for (const lang of ["es", "en"]) {
      for (const t of await wikiBuscar(tema, lang, 8, f)) {
        if (slides.length >= nSlides) break;
        if (usados.has(t)) continue;
        usados.add(t);
        const rel = await wikiPagina(t, lang, f);
        if (!rel) continue;
        const puntos = puntosClave(rel.texto.split("\n==")[0], 3);
        if (!puntos.length) continue;
        slides.push({
          titulo: rel.titulo,
          puntos,
          imagen: rel.imagen ? { url: rel.imagen, pagina: rel.url, autor: "Wikipedia" } : null,
        });
        fuentes.push({ nombre: `Wikipedia (${lang}): ${rel.titulo}`, url: rel.url });
      }
      if (slides.length >= nSlides) break;
    }
  }
  if (!slides.length) return null;

  // Imágenes: una búsqueda general y una por diapositiva (en paralelo)
  const [pool, ...porSlide] = await Promise.all([
    commonsImagenes(tema, 8, f),
    ...slides.map((s) => (s.imagen ? Promise.resolve([]) : commonsImagenes(`${tema} ${s.titulo}`, 4, f))),
  ]);

  const vistas = new Set();
  let portada = null;
  if (pagina.imagen) {
    portada = { url: pagina.imagen, pagina: pagina.url, autor: "Wikipedia" };
    vistas.add(pagina.imagen);
  }
  slides.forEach((s) => s.imagen && vistas.add(s.imagen.url));

  slides.forEach((s, i) => {
    if (s.imagen) return;
    for (const c of [...porSlide[i], ...pool]) {
      if (vistas.has(c.url)) continue;
      vistas.add(c.url);
      s.imagen = c;
      if (c.pagina) fuentes.push({ nombre: `Imagen: ${c.autor} (Wikimedia Commons)`, url: c.pagina });
      break;
    }
  });
  if (!portada) {
    const libre = pool.find((c) => !vistas.has(c.url));
    if (libre) { portada = libre; vistas.add(libre.url); }
  }

  const [articulos, libros] = await pExtras;
  fuentes.push(...articulos, ...libros);

  return { tema, slides, fuentes, portada };
}
