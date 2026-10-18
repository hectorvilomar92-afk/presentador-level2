import { recopilar } from "./contenido.js";
import { construirPptx } from "./pptx.js";

const $ = (selector) => document.querySelector(selector);
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[character]));

function setEstado(texto = "", tipo = "") {
  const estado = $("#estado");
  estado.textContent = texto;
  estado.classList.remove("ok", "error");
  if (tipo) estado.classList.add(tipo);
}

async function cargarImagen(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const blob = await response.blob();
    if (!/^image\/(jpeg|png)/.test(blob.type)) return null;

    const data = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
    const dimensions = await new Promise((resolve) => {
      const image = new Image();
      image.onload = () => resolve({ w: image.naturalWidth, h: image.naturalHeight });
      image.onerror = () => resolve(null);
      image.src = data;
    });
    return dimensions?.w && dimensions?.h ? { data, ...dimensions } : null;
  } catch {
    return null;
  }
}

const nombreArchivo = (tema) => (
  tema.replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_+|_+$/g, "").slice(0, 60)
  || "presentacion"
) + ".pptx";

let ultimaPresentacion = null;

$("#num").addEventListener("input", (event) => {
  $("#num-val").textContent = event.target.value;
});

$("#form-gen").addEventListener("submit", async (event) => {
  event.preventDefault();
  const tema = $("#tema").value.trim();
  if (!tema) {
    setEstado("Escribe un tema para continuar.", "error");
    return;
  }

  const boton = $("#btn-gen");
  boton.disabled = true;
  $("#resultado").hidden = true;
  try {
    setEstado("Buscando información en fuentes públicas…");
    const datos = await recopilar(tema, Number($("#num").value));
    if (!datos) {
      setEstado("No se encontró información suficiente. Prueba con otro tema o revisa tu conexión a internet.", "error");
      return;
    }

    if (typeof window.PptxGenJS !== "function") {
      throw new Error("No se pudo cargar PptxGenJS desde el CDN.");
    }

    setEstado("Preparando imágenes…");
    const [portadaImg] = await Promise.all([
      datos.portada ? cargarImagen(datos.portada.url) : Promise.resolve(null),
      ...datos.slides.map(async (slide) => {
        slide.img = slide.imagen ? await cargarImagen(slide.imagen.url) : null;
      }),
    ]);

    setEstado("Creando el archivo PowerPoint…");
    const pptx = construirPptx(window.PptxGenJS, {
      tema: datos.tema,
      slides: datos.slides,
      fuentes: datos.fuentes,
      portada: datos.portada,
      portadaImg,
      incluirYT: $("#yt").checked,
    });
    const nombre = nombreArchivo(tema);
    await pptx.writeFile({ fileName: nombre });
    ultimaPresentacion = { pptx, nombre };

    $("#lista-slides").innerHTML = [
      "Portada",
      ...datos.slides.map((slide) => slide.titulo),
      "Fuentes y referencias",
      ...($("#yt").checked ? ["Videos recomendados"] : []),
    ].map((titulo) => `<li>${esc(titulo)}</li>`).join("");
    $("#resultado").hidden = false;
    setEstado(`Presentación descargada con ${datos.slides.length} diapositivas de contenido.`, "ok");
  } catch (error) {
    console.error("Error generando la presentación:", error);
    setEstado("No se pudo generar la presentación. Revisa tu conexión e inténtalo de nuevo.", "error");
  } finally {
    boton.disabled = false;
  }
});

$("#btn-re").addEventListener("click", async () => {
  if (!ultimaPresentacion) return;
  try {
    await ultimaPresentacion.pptx.writeFile({ fileName: ultimaPresentacion.nombre });
  } catch (error) {
    console.error("Error descargando la presentación:", error);
    setEstado("No se pudo descargar el archivo otra vez. Inténtalo de nuevo.", "error");
  }
});
