import { db } from "./firebase-config.js";
import {
  collection,
  onSnapshot,
  addDoc,
  serverTimestamp,
  doc,
  getDoc,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

import {
  getCart,
  addToCart,
  changeQty,
  removeFromCart,
  clearCart,
  getTotalLines,
  getTotalUnits,
  getQty,
} from "./cart.js";

// ──────────────────────────────────────────────────────────
// CONFIGURACIÓN
// ──────────────────────────────────────────────────────────

// Número real de WhatsApp del negocio.
// Se lee desde Firestore en el momento exacto del envío del pedido,
// para garantizar que siempre se use el número más actualizado.
// El fallback se usa solo si Firestore falla.
const WHATSAPP_FALLBACK = "5493735627215";

async function fetchWhatsappNumber() {
  try {
    const snap = await getDoc(doc(db, "config", "general"));
    if (snap.exists() && snap.data().whatsappNumber) {
      return snap.data().whatsappNumber;
    }
  } catch (err) {
    console.warn("No se pudo leer el número de WhatsApp desde Firestore, usando fallback.", err);
  }
  return WHATSAPP_FALLBACK;
}

// Clave de localStorage donde se guarda si el cliente compra
// por mayor o por menor.
const BUYER_TYPE_KEY = "marchese_buyer_type";
const BUYER_TYPE_LABELS = { mayorista: "Mayorista", minorista: "Minorista" };
const BUYER_TYPE_WA_LABELS = {
  mayorista: "📦 PEDIDO MAYORISTA",
  minorista: "🛍️ PEDIDO MINORISTA",
};

// Clave de localStorage donde se guardan los datos de contacto del
// cliente (nombre, localidad, provincia, teléfono, observaciones) para
// no tener que volver a tipearlos en próximos pedidos.
const BUYER_INFO_KEY = "marchese_buyer_info";

// ──────────────────────────────────────────────────────────
// REFERENCIAS AL DOM
// ──────────────────────────────────────────────────────────

const productGrid = document.getElementById("productGrid");
const categoryContainer = document.getElementById("categoryContainer");
const brandsContainer = document.getElementById("brandsContainer");
const searchInput = document.getElementById("searchInput");
const searchClearBtn = document.getElementById("searchClearBtn");

// Botones que abren la hoja/dropdown de filtros: hay un set en la tira
// mobile y otro junto al buscador en desktop, ambos operan sobre el mismo
// estado y comparten el mismo componente filterSheet.
const filterCatSelectBtns = document.querySelectorAll('[data-filter-trigger="cat"]');
const filterCatSelectValues = document.querySelectorAll('[data-filter-value="cat"]');
const filterBrandSelectBtns = document.querySelectorAll('[data-filter-trigger="brand"]');
const filterBrandSelectValues = document.querySelectorAll('[data-filter-value="brand"]');

const filterSheetOverlay = document.getElementById("filterSheetOverlay");
const filterSheet = document.getElementById("filterSheet");
const filterSheetTitle = document.getElementById("filterSheetTitle");
const filterSheetCloseBtn = document.getElementById("filterSheetCloseBtn");
const filterSheetSearch = document.getElementById("filterSheetSearch");
const filterSheetBody = document.getElementById("filterSheetBody");
const filterSheetClearBtn = document.getElementById("filterSheetClearBtn");
const filterSheetApplyBtn = document.getElementById("filterSheetApplyBtn");

const cartBtn = document.getElementById("cartBtn");
const cartBadge = document.getElementById("cartBadge");
const cartOverlay = document.getElementById("cartOverlay");
const cartDrawer = document.getElementById("cartDrawer");
const cartCloseBtn = document.getElementById("cartCloseBtn");
const cartBody = document.getElementById("cartBody");
const cartFooter = document.getElementById("cartFooter");
const cartTotalLines = document.getElementById("cartTotalLines");
const cartTotalUnits = document.getElementById("cartTotalUnits");
const cartWhatsappBtn = document.getElementById("cartWhatsappBtn");
const cartClearBtn = document.getElementById("cartClearBtn");

const buyerNameInput = document.getElementById("buyerNameInput");
const buyerLocalityInput = document.getElementById("buyerLocalityInput");
const buyerProvinceInput = document.getElementById("buyerProvinceInput");
const buyerPhoneInput = document.getElementById("buyerPhoneInput");
const buyerNotesInput = document.getElementById("buyerNotesInput");

// Referencias al nuevo modal de datos del pedido
const orderModalOverlay = document.getElementById("orderModalOverlay");
const orderModalCloseBtn = document.getElementById("orderModalCloseBtn");
const orderModalSendBtn  = document.getElementById("orderModalSendBtn");
const omBuyerName        = document.getElementById("omBuyerName");
const omBuyerLocality    = document.getElementById("omBuyerLocality");
const omBuyerProvince    = document.getElementById("omBuyerProvince");
const omBuyerPhone       = document.getElementById("omBuyerPhone");
const omBuyerNotes       = document.getElementById("omBuyerNotes");

const clearCartDialogOverlay = document.getElementById("clearCartDialogOverlay");
const clearCartCancel = document.getElementById("clearCartCancel");
const clearCartConfirm = document.getElementById("clearCartConfirm");

const toastContainer = document.getElementById("toastContainer");

const modalOverlay = document.getElementById("productModalOverlay");
const productModal = document.getElementById("productModal");
const modalCloseBtn = document.getElementById("modalCloseBtn");
const modalBody = document.getElementById("modalBody");

const lightboxOverlay = document.getElementById("lightboxOverlay");
const lightboxCloseBtn = document.getElementById("lightboxCloseBtn");
const lightboxImg = document.getElementById("lightboxImg");

const contactName = document.getElementById("contactName");
const tagPillsWrap = document.getElementById("tagPillsWrap");
const tagPillsContainer = document.getElementById("tagPillsContainer");
const contactMessage = document.getElementById("contactMessage");
const contactSubmit = document.getElementById("contactSubmit");
const contactFeedback = document.getElementById("contactFeedback");

const buyerModalOverlay = document.getElementById("buyerModalOverlay");
const buyerModalCloseBtn = document.getElementById("buyerModalCloseBtn");
const buyerOptionMayorista = document.getElementById("buyerOptionMayorista");
const buyerOptionMinorista = document.getElementById("buyerOptionMinorista");

const contactUsBtn = document.getElementById("contactUsBtn");
const contactModalOverlay = document.getElementById("contactModalOverlay");
const contactModalCloseBtn = document.getElementById("contactModalCloseBtn");
const contactWaBtn = document.getElementById("contactWaBtn");
const contactWaNumber = document.getElementById("contactWaNumber");

const heroBuyerStatusText = document.getElementById("heroBuyerStatusText");
const heroBuyerChangeBtn = document.getElementById("heroBuyerChangeBtn");

const mobileMenuBuyerText = document.getElementById("mobileMenuBuyerText");
const mobileMenuBuyerChangeBtn = document.getElementById("mobileMenuBuyerChangeBtn");

const cartBuyerBadge = document.getElementById("cartBuyerBadge");

// ──────────────────────────────────────────────────────────
// ESTADO
// ──────────────────────────────────────────────────────────

let allProducts = [];
let allCategories = [];
let allBrands = [];

let productsLoaded = false;
let categoriesLoaded = false;
let brandsLoaded = false;

let activeCategory = "Todos";
let activeBrands = new Set();
let searchTerm = "";
let activeTag = null; // null = sin filtro de tag

// Tipo de compra elegido por el cliente: "mayorista" | "minorista" | null
let buyerType = null;

// Tipo de hoja de filtros mobile abierta actualmente: "cat" | "brand" | null
let filterSheetType = null;

// Paginación progresiva de productos (scroll infinito)
const PRODUCTS_PER_PAGE = 12;
let productsVisible = PRODUCTS_PER_PAGE;
let isLoadingMoreProducts = false; // evita disparos duplicados del observer
let infiniteScrollObserver = null;

// ──────────────────────────────────────────────────────────
// UTILIDADES
// ──────────────────────────────────────────────────────────

function escapeHtml(str = "") {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Normaliza texto para comparaciones de búsqueda: pasa a minúsculas y
// quita acentos/tildes, para que buscar "cafe" encuentre "café", "océano"
// encuentre "oceano", etc.
function normalizeText(str = "") {
  return String(str)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

// Genera variantes singular/plural aproximadas de una palabra en español,
// para que buscar "chocolate" encuentre productos que dicen "chocolates"
// (y viceversa), "caramelo" encuentre "caramelos", "limon" encuentre
// "limones", etc. No es un stemmer perfecto, pero cubre los casos típicos
// de un catálogo de golosinas.
function wordVariants(word) {
  const variants = new Set([word]);
  if (word.length > 3) {
    if (word.endsWith("es")) {
      variants.add(word.slice(0, -2)); // "limones" -> "limon"
      variants.add(word.slice(0, -1)); // "dulces" -> "dulce"
    } else if (word.endsWith("s")) {
      variants.add(word.slice(0, -1)); // "chocolates" -> "chocolate"
    } else {
      variants.add(word + "s");        // "chocolate" -> "chocolates"
      variants.add(word + "es");       // "limon" -> "limones"
    }
  }
  return variants;
}

// Muestra u oculta el botón "X" del buscador según si hay texto escrito.
function updateSearchClearBtn() {
  if (!searchClearBtn) return;
  searchClearBtn.classList.toggle("visible", searchInput.value.length > 0);
}

function debounce(fn, delay = 250) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

const TOAST_DURATION = 3400; // ms en pantalla antes de salir

function showToast(message, type = "ok", subtitle = "") {
  // Íconos SVG por tipo
  const ICONS = {
    ok: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
           <path stroke-linecap="round" stroke-linejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"/>
         </svg>`,
    error: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
            </svg>`,
    success: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/>
              </svg>`,
  };

  const typeClass = type === "error" ? " toast-error" : type === "success" ? " toast-success" : "";

  const toast = document.createElement("div");
  toast.className = `toast${typeClass}`;
  toast.style.setProperty("--toast-duration", `${TOAST_DURATION}ms`);
  toast.innerHTML = `
    <div class="toast-icon">${ICONS[type] || ICONS.ok}</div>
    <div class="toast-content">
      <div class="toast-title">${message}</div>
      ${subtitle ? `<div class="toast-sub">${subtitle}</div>` : ""}
    </div>
    <button class="toast-close" aria-label="Cerrar">
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
        <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
      </svg>
    </button>`;

  toastContainer.appendChild(toast);

  // Forzar reflow para que la transición arranque
  requestAnimationFrame(() => {
    requestAnimationFrame(() => toast.classList.add("toast-visible"));
  });

  function dismissToast() {
    toast.classList.add("toast-hiding");
    toast.classList.remove("toast-visible");
    setTimeout(() => toast.remove(), 350);
  }

  toast.querySelector(".toast-close").addEventListener("click", dismissToast);

  setTimeout(dismissToast, TOAST_DURATION);
}

// Set de íconos/colores de respaldo para productos sin imagen,
// agrupados por categoría para mantener la estética original.
const ICONS_BY_CATEGORY = {
  alfajores: {
    bg: "bg-sand",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" fill="none" viewBox="0 0 24 24" stroke="#b45309" stroke-width="1.4">
      <rect x="4" y="2" width="16" height="20" rx="2" fill="#e9c57a" stroke="#b45309" stroke-width="1.4"/>
      <line x1="4" y1="8" x2="20" y2="8" stroke="#b45309" stroke-width="1.4"/>
      <line x1="4" y1="14" x2="20" y2="14" stroke="#b45309" stroke-width="1.4"/>
      <line x1="12" y1="2" x2="12" y2="22" stroke="#b45309" stroke-width="1.4"/>
    </svg>`,
  },
  caramelos: {
    bg: "bg-blush",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" fill="none" viewBox="0 0 24 24" stroke="#9b1c1c" stroke-width="1.4">
      <path d="M3 12l4-4v8l-4-4zM21 12l-4-4v8l4-4z" fill="#f5b8b4" stroke="#9b1c1c" stroke-width="1.4" stroke-linejoin="round"/>
      <rect x="7" y="6" width="10" height="12" rx="2" fill="#fcd5d2" stroke="#9b1c1c" stroke-width="1.4"/>
      <circle cx="12" cy="12" r="2" fill="#9b1c1c"/>
    </svg>`,
  },
  snacks: {
    bg: "bg-mist",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" fill="none" viewBox="0 0 24 24" stroke="#1e40af" stroke-width="1.4">
      <path d="M6 8l2 12h8l2-12H6z" fill="#bfcef5" stroke="#1e40af" stroke-width="1.4" stroke-linejoin="round"/>
      <circle cx="9" cy="5" r="2" fill="#f5e67a" stroke="#1e40af" stroke-width="1.2"/>
      <circle cx="13" cy="4" r="2" fill="#f5e67a" stroke="#1e40af" stroke-width="1.2"/>
      <circle cx="15" cy="6" r="2" fill="#f5e67a" stroke="#1e40af" stroke-width="1.2"/>
    </svg>`,
  },
  galletitas: {
    bg: "bg-mint",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" fill="none" viewBox="0 0 24 24" stroke="#166534" stroke-width="1.4">
      <circle cx="12" cy="12" r="9" fill="#a6d9b4" stroke="#166534" stroke-width="1.4"/>
      <circle cx="9" cy="9" r="1.5" fill="#5c3e1a"/>
      <circle cx="14" cy="10" r="1.2" fill="#5c3e1a"/>
      <circle cx="11" cy="14" r="1.5" fill="#5c3e1a"/>
      <circle cx="15" cy="14" r="1" fill="#5c3e1a"/>
      <circle cx="8" cy="13" r="1" fill="#5c3e1a"/>
    </svg>`,
  },
  chocolates: {
    bg: "bg-sand",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" fill="none" viewBox="0 0 24 24" stroke="#7c2d12" stroke-width="1.4">
      <rect x="3" y="5" width="18" height="14" rx="2" fill="#d9a45a" stroke="#7c2d12" stroke-width="1.4"/>
      <path d="M3 12h18M9 5v14M15 5v14" stroke="#7c2d12" stroke-width="1.4"/>
    </svg>`,
  },
};

// Ícono genérico de respaldo para categorías que no estén en el mapa anterior
const DEFAULT_ICON = {
  svg: `<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" fill="none" viewBox="0 0 24 24" stroke="#92733f" stroke-width="1.4">
    <circle cx="12" cy="12" r="9" fill="#f0e3c8" stroke="#92733f" stroke-width="1.4"/>
    <path d="M8 12h8M12 8v8" stroke="#92733f" stroke-width="1.4" stroke-linecap="round"/>
  </svg>`,
};
const DEFAULT_BG_CLASSES = ["bg-sand", "bg-blush", "bg-mist", "bg-mint"];

function getProductVisual(product) {
  if (product.image) {
    return {
      bg: "",
      inner: `<img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}" loading="lazy">`,
    };
  }
  const key = (product.category || "").trim().toLowerCase();
  const preset = ICONS_BY_CATEGORY[key];
  if (preset) {
    return { bg: preset.bg, inner: preset.svg };
  }
  // Color de respaldo determinístico según el nombre de la categoría
  let hash = 0;
  for (const ch of key) hash = (hash * 31 + ch.charCodeAt(0)) % 997;
  const bg = DEFAULT_BG_CLASSES[hash % DEFAULT_BG_CLASSES.length];
  return { bg, inner: DEFAULT_ICON.svg };
}

// ──────────────────────────────────────────────────────────
// CARGA DE DATOS DESDE FIRESTORE (en tiempo real)
// ──────────────────────────────────────────────────────────

function sortByOrderThenName(a, b) {
  const orderA = typeof a.order === "number" ? a.order : Infinity;
  const orderB = typeof b.order === "number" ? b.order : Infinity;
  if (orderA !== orderB) return orderA - orderB;
  return (a.name || "").localeCompare(b.name || "", "es");
}

// Orden alfabético (a-z) por nombre, ignorando el campo "order".
// Se usa para los paneles de categorías y marcas.
function sortByNameAlpha(a, b) {
  return (a.name || "").localeCompare(b.name || "", "es");
}

// Orden de productos: primero alfabético por categoría, y dentro de
// cada categoría se respeta el orden configurado (order/nombre).
function sortByCategoryThenOrder(a, b) {
  const catCompare = (a.category || "").localeCompare(b.category || "", "es");
  if (catCompare !== 0) return catCompare;
  return sortByOrderThenName(a, b);
}

function initFirestoreListeners() {
  // Productos
  onSnapshot(
    collection(db, "products"),
    (snapshot) => {
      allProducts = snapshot.docs
        .map((doc) => ({ id: doc.id, ...doc.data() }))
        .sort(sortByOrderThenName);
      productsLoaded = true;
      renderCategories();
      renderBrands();
      renderTagPills();
      renderProducts();
      if (isCartOpen()) renderCart();
    },
    (error) => {
      console.error("Error cargando productos:", error);
      productsLoaded = true;
      productGrid.innerHTML = `
        <div class="state-msg">
          <strong>No pudimos cargar el catálogo</strong>
          <span>Probá recargar la página en unos minutos.</span>
        </div>`;
    }
  );

  // Categorías
  onSnapshot(
    collection(db, "categories"),
    (snapshot) => {
      allCategories = snapshot.docs
        .map((doc) => ({ id: doc.id, ...doc.data() }))
        .filter((c) => c.active !== false)
        .sort(sortByNameAlpha);
      categoriesLoaded = true;
      renderCategories();
    },
    (error) => console.error("Error cargando categorías:", error)
  );

  // Marcas
  onSnapshot(
    collection(db, "brands"),
    (snapshot) => {
      allBrands = snapshot.docs
        .map((doc) => ({ id: doc.id, ...doc.data() }))
        .filter((b) => b.active !== false)
        .sort(sortByNameAlpha);
      brandsLoaded = true;
      renderBrands();
    },
    (error) => console.error("Error cargando marcas:", error)
  );

  // Banners publicitarios — carrusel del hero
  onSnapshot(
    collection(db, "banners"),
    (snapshot) => {
      const banners = snapshot.docs
        .map((doc) => ({ id: doc.id, ...doc.data() }))
        .filter((b) => b.active !== false && b.imageUrl)
        .sort((a, b) => {
          const oA = typeof a.order === "number" ? a.order : Infinity;
          const oB = typeof b.order === "number" ? b.order : Infinity;
          return oA - oB;
        });
      if (typeof window.initCarousel === "function") {
        window.initCarousel(banners);
      }
    },
    (error) => {
      console.error("Error cargando banners:", error);
      if (typeof window.initCarousel === "function") {
        window.initCarousel([]);
      }
    }
  );
}

// ──────────────────────────────────────────────────────────
// SKELETONS DE CARGA (categorías, marcas, productos)
// ──────────────────────────────────────────────────────────

function renderCategorySkeletons(count = 5) {
  const widths = [92, 75, 88, 65, 80, 70];
  categoryContainer.innerHTML = Array.from({ length: count })
    .map((_, i) => `<div class="skel-cat-row skel-shimmer" style="width:${widths[i % widths.length]}%;"></div>`)
    .join("");
}

function renderBrandSkeletons(count = 4) {
  const widths = [70, 55, 85, 60, 75];
  brandsContainer.innerHTML = Array.from({ length: count })
    .map((_, i) => `
      <label class="skel-brand-row">
        <span class="skel-checkbox skel-shimmer"></span>
        <span class="skel-label skel-shimmer" style="width:${widths[i % widths.length]}%;"></span>
      </label>`)
    .join("");
}

function skeletonCardHtml() {
  return `
    <div class="product-card skeleton-card">
      <div class="card-img skel-shimmer"></div>
      <div class="card-body">
        <div class="skel-line skel-cat"></div>
        <div class="skel-line skel-name"></div>
        <div class="skel-line skel-desc"></div>
        <div class="skel-line skel-desc short"></div>
        <div class="skel-line skel-btn"></div>
      </div>
    </div>`;
}

function renderProductSkeletons(count = 8) {
  productGrid.innerHTML = Array.from({ length: count }).map(skeletonCardHtml).join("");
}

// ──────────────────────────────────────────────────────────
// RENDER: CATEGORÍAS
// ──────────────────────────────────────────────────────────

function getCategoryList() {
  // Si hay marcas activas, solo devolvemos las categorías en las que esas
  // marcas realmente tienen productos cargados — es el filtro recíproco
  // de getBrandList(): elegís una marca y en categorías ves solo lo que
  // esa marca vende.
  const categoriesForActiveBrands =
    activeBrands.size > 0
      ? new Set(
          allProducts
            .filter((p) => p.brand && activeBrands.has(p.brand) && p.category)
            .map((p) => p.category)
        )
      : null;

  const restrictToBrands = (names) =>
    categoriesForActiveBrands ? names.filter((name) => categoriesForActiveBrands.has(name)) : names;

  if (allCategories.length > 0) {
    return restrictToBrands(allCategories.map((c) => c.name).filter(Boolean));
  }
  // Si no hay colección "categories" todavía, las derivamos de los productos ACTIVOS
  const set = new Set();
  allProducts.filter((p) => p.active !== false).forEach((p) => p.category && set.add(p.category));
  return restrictToBrands(Array.from(set).sort((a, b) => a.localeCompare(b, "es")));
}

const CAT_VISIBLE_LIMIT = 6;
const BRAND_VISIBLE_LIMIT = 6;
let catExpanded = false;
let brandExpanded = false;

function renderCategories() {
  // Mientras no llegó ni la colección "categories" ni "products" todavía no hay
  // nada de donde derivar la lista, así que mostramos el skeleton.
  if (!categoriesLoaded && !productsLoaded) {
    renderCategorySkeletons();
    return;
  }

  const categories = getCategoryList();

  const buttons = [{ name: "Todos" }, ...categories.map((name) => ({ name }))];
  const needsToggle = buttons.length > CAT_VISIBLE_LIMIT;

  // ── Sidebar desktop ──────────────────────────────────────
  categoryContainer.innerHTML = buttons
    .map((c, i) => {
      const isActive = c.name === activeCategory;
      const hiddenClass = needsToggle && i >= CAT_VISIBLE_LIMIT && !catExpanded ? " hidden-item" : "";
      return `
        <button class="cat-btn${isActive ? " active" : ""}${hiddenClass}" data-cat="${escapeHtml(c.name)}">
          <span>${escapeHtml(c.name)}</span>
        </button>`;
    })
    .join("") + (needsToggle ? `
        <button class="show-more-btn${catExpanded ? " expanded" : ""}" id="catShowMore">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"/>
          </svg>
          ${catExpanded ? "Ver menos" : `Ver ${buttons.length - CAT_VISIBLE_LIMIT} más`}
        </button>` : "");

  const catToggleBtn = document.getElementById("catShowMore");
  if (catToggleBtn) {
    catToggleBtn.addEventListener("click", () => {
      catExpanded = !catExpanded;
      renderCategories();
    });
  }

  // ── Selector compacto + hoja mobile ───────────────────────
  updateFilterSelectLabels();
  if (filterSheetType === "cat" && filterSheet.classList.contains("open")) {
    renderFilterSheetBody(filterSheetSearch.value.trim().toLowerCase());
  }

  // Si la categoría activa ya no existe (fue borrada en el admin), volvemos a "Todos"
  if (activeCategory !== "Todos" && !categories.includes(activeCategory)) {
    activeCategory = "Todos";
    renderCategories();
    renderBrands();
    renderProducts();
  }
}

// ──────────────────────────────────────────────────────────
// RENDER: MARCAS
// ──────────────────────────────────────────────────────────

function getBrandList() {
  // Si hay una categoría activa (distinta de "Todos"), solo devolvemos las
  // marcas que tienen al menos un producto cargado en esa categoría. Así,
  // al elegir por ejemplo "Alfajores", el listado de marcas se reduce
  // automáticamente a las marcas que realmente venden alfajores.
  const brandsInActiveCategory =
    activeCategory !== "Todos"
      ? new Set(
          allProducts
            .filter((p) => p.category === activeCategory && p.brand)
            .map((p) => p.brand)
        )
      : null;

  const restrictToCategory = (names) =>
    brandsInActiveCategory ? names.filter((name) => brandsInActiveCategory.has(name)) : names;

  if (allBrands.length > 0) {
    return restrictToCategory(allBrands.map((b) => b.name).filter(Boolean));
  }
  const set = new Set();
  allProducts.forEach((p) => p.brand && set.add(p.brand));
  return restrictToCategory(Array.from(set).sort((a, b) => a.localeCompare(b, "es")));
}

function renderBrands() {
  // Mientras no llegó ni "brands" ni "products" no hay de dónde derivar marcas.
  if (!brandsLoaded && !productsLoaded) {
    renderBrandSkeletons();
    return;
  }

  const brands = getBrandList();

  // ── Sidebar desktop ──────────────────────────────────────
  if (brands.length === 0) {
    const emptyMsg = activeCategory !== "Todos"
      ? `Sin marcas en "${escapeHtml(activeCategory)}"`
      : "Sin marcas cargadas";
    brandsContainer.innerHTML = `<p style="font-size:0.8rem;color:var(--muted)">${emptyMsg}</p>`;
  } else {
    const needsToggle = brands.length > BRAND_VISIBLE_LIMIT;

    brandsContainer.innerHTML = brands
      .map((name, i) => {
        const checked = activeBrands.has(name) ? "checked" : "";
        const hiddenClass = needsToggle && i >= BRAND_VISIBLE_LIMIT && !brandExpanded ? " hidden-item" : "";
        return `
          <label class="brand-check${hiddenClass}">
            <input type="checkbox" data-brand="${escapeHtml(name)}" ${checked}>
            ${escapeHtml(name)}
          </label>`;
      })
      .join("") + (needsToggle ? `
          <button class="show-more-btn${brandExpanded ? " expanded" : ""}" id="brandShowMore">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"/>
            </svg>
            ${brandExpanded ? "Ver menos" : `Ver ${brands.length - BRAND_VISIBLE_LIMIT} más`}
          </button>` : "");

    const brandToggleBtn = document.getElementById("brandShowMore");
    if (brandToggleBtn) {
      brandToggleBtn.addEventListener("click", () => {
        brandExpanded = !brandExpanded;
        renderBrands();
      });
    }
  }

  // ── Selector compacto + hoja mobile ───────────────────────
  updateFilterSelectLabels();
  if (filterSheetType === "brand" && filterSheet.classList.contains("open")) {
    renderFilterSheetBody(filterSheetSearch.value.trim().toLowerCase());
  }

  // Limpiar marcas activas que ya no existen
  let changed = false;
  activeBrands.forEach((b) => {
    if (!brands.includes(b)) {
      activeBrands.delete(b);
      changed = true;
    }
  });
  if (changed) renderProducts();
}

// ──────────────────────────────────────────────────────────
// FILTROS MOBILE: barra selectora + hoja inferior
// ──────────────────────────────────────────────────────────

/** Normaliza texto para que la búsqueda dentro de la hoja ignore acentos. */
function normalizeForSearch(str = "") {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** Actualiza el texto y el estado "activo" de los dos botones selectores. */
function updateFilterSelectLabels() {
  if (!filterCatSelectBtns.length) return;

  filterCatSelectValues.forEach((el) => (el.textContent = activeCategory));
  filterCatSelectBtns.forEach((btn) =>
    btn.classList.toggle("has-active", activeCategory !== "Todos")
  );

  const brandCount = activeBrands.size;
  const brandLabel =
    brandCount === 0
      ? "Todas"
      : brandCount === 1
      ? Array.from(activeBrands)[0]
      : `${brandCount} marcas`;
  filterBrandSelectValues.forEach((el) => (el.textContent = brandLabel));
  filterBrandSelectBtns.forEach((btn) => btn.classList.toggle("has-active", brandCount > 0));
}

/** Actualiza el botón "Ver N productos" según el filtrado actual. */
function updateFilterSheetApplyLabel() {
  if (!filterSheetApplyBtn) return;
  const n = getFilteredProducts().length;
  filterSheetApplyBtn.textContent = `Ver ${n} producto${n === 1 ? "" : "s"}`;
}

/** Dibuja el contenido de la hoja (categorías o marcas) según filterSheetType. */
function renderFilterSheetBody(search = "") {
  if (!filterSheetBody) return;
  const q = normalizeForSearch(search.trim());

  if (filterSheetType === "cat") {
    const categories = getCategoryList();
    const all = [{ name: "Todos" }, ...categories.map((name) => ({ name }))];
    const filtered = q
      ? all.filter((c) => normalizeForSearch(c.name).includes(q))
      : all;

    filterSheetBody.innerHTML = filtered.length
      ? filtered
          .map((c) => {
            const isActive = c.name === activeCategory;
            return `
              <button class="filter-option${isActive ? " active" : ""}" data-cat="${escapeHtml(c.name)}">
                <span>${escapeHtml(c.name)}</span>
              </button>`;
          })
          .join("")
      : `<div class="filter-sheet-empty">No encontramos categorías para "${escapeHtml(search)}"</div>`;
  } else if (filterSheetType === "brand") {
    const brands = getBrandList();
    const filtered = q
      ? brands.filter((name) => normalizeForSearch(name).includes(q))
      : brands;

    const allOption = !q
      ? `
        <button class="filter-option-check${activeBrands.size === 0 ? " active" : ""}" data-brand-all>
          <span class="filter-check-box">
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
              <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/>
            </svg>
          </span>
          <span class="filter-option-check-name">Todas</span>
        </button>`
      : "";

    const brandOptions = filtered
      .map((name) => {
        const isActive = activeBrands.has(name);
        return `
          <button class="filter-option-check${isActive ? " active" : ""}" data-brand="${escapeHtml(name)}">
            <span class="filter-check-box">
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
                <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/>
              </svg>
            </span>
            <span class="filter-option-check-name">${escapeHtml(name)}</span>
          </button>`;
      })
      .join("");

    filterSheetBody.innerHTML =
      allOption || brandOptions
        ? allOption + brandOptions
        : `<div class="filter-sheet-empty">No encontramos marcas para "${escapeHtml(search)}"</div>`;
  }
}

// Breakpoint que separa la tira mobile (hoja inferior) del dropdown de escritorio.
const FILTER_DESKTOP_BREAKPOINT = 961;
function isDesktopFilterLayout() {
  return window.innerWidth >= FILTER_DESKTOP_BREAKPOINT;
}

/** Posiciona la hoja como dropdown anclado debajo del botón que la abrió (solo desktop). */
function positionFilterSheetAsDropdown(triggerBtn) {
  const rect = triggerBtn.getBoundingClientRect();
  const sheetWidth = 300;
  let left = rect.left;
  // Evita que el dropdown se salga por el borde derecho de la ventana.
  left = Math.min(left, window.innerWidth - sheetWidth - 12);
  left = Math.max(left, 12);
  filterSheet.style.top = `${rect.bottom + 8}px`;
  filterSheet.style.left = `${left}px`;
}

function openFilterSheet(type, triggerBtn) {
  filterSheetType = type;
  filterSheetTitle.textContent = type === "cat" ? "Categoría" : "Marca";
  filterSheetSearch.value = "";
  filterSheetSearch.placeholder = type === "cat" ? "Buscar categoría…" : "Buscar marca…";

  renderFilterSheetBody();
  updateFilterSheetApplyLabel();

  const desktop = isDesktopFilterLayout() && triggerBtn;
  filterSheet.classList.toggle("dropdown", desktop);
  filterSheetOverlay.classList.toggle("dropdown", desktop);
  if (desktop) {
    positionFilterSheetAsDropdown(triggerBtn);
  } else {
    filterSheet.style.top = "";
    filterSheet.style.left = "";
  }

  filterSheetOverlay.classList.add("open");
  filterSheet.classList.add("open");
  filterCatSelectBtns.forEach((btn) => {
    btn.classList.toggle("open", type === "cat");
    btn.setAttribute("aria-expanded", type === "cat" ? "true" : "false");
  });
  filterBrandSelectBtns.forEach((btn) => {
    btn.classList.toggle("open", type === "brand");
    btn.setAttribute("aria-expanded", type === "brand" ? "true" : "false");
  });
  // En desktop el dropdown flota junto al botón: no bloqueamos el scroll de fondo.
  if (!desktop) lockBodyScroll();
}

function closeFilterSheet() {
  if (!filterSheet.classList.contains("open")) return;
  filterSheetOverlay.classList.remove("open");
  filterSheet.classList.remove("open");
  filterCatSelectBtns.forEach((btn) => {
    btn.classList.remove("open");
    btn.setAttribute("aria-expanded", "false");
  });
  filterBrandSelectBtns.forEach((btn) => {
    btn.classList.remove("open");
    btn.setAttribute("aria-expanded", "false");
  });
  unlockBodyScroll();
}

function isFilterSheetOpen() {
  return filterSheet.classList.contains("open");
}

function setupFilterSheetListeners() {
  if (!filterCatSelectBtns.length) return; // no estamos en una página con filtros

  filterCatSelectBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      if (filterSheetType === "cat" && isFilterSheetOpen()) {
        closeFilterSheet();
        return;
      }
      openFilterSheet("cat", btn);
    });
  });

  filterBrandSelectBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      if (filterSheetType === "brand" && isFilterSheetOpen()) {
        closeFilterSheet();
        return;
      }
      openFilterSheet("brand", btn);
    });
  });

  filterSheetCloseBtn.addEventListener("click", closeFilterSheet);
  filterSheetOverlay.addEventListener("click", (e) => {
    if (e.target === filterSheetOverlay) closeFilterSheet();
  });

  filterSheetSearch.addEventListener(
    "input",
    debounce((e) => renderFilterSheetBody(e.target.value), 120)
  );

  // Selección dentro de la hoja (delegación)
  filterSheetBody.addEventListener("click", (e) => {
    if (filterSheetType === "cat") {
      const btn = e.target.closest(".filter-option[data-cat]");
      if (!btn) return;
      activeCategory = btn.dataset.cat;
      renderCategories();
      renderBrands(); // la lista de marcas depende de la categoría elegida
      renderProducts();
      updateFilterSheetApplyLabel();
      closeFilterSheet(); // selección única: aplica y cierra
    } else if (filterSheetType === "brand") {
      const allBtn = e.target.closest(".filter-option-check[data-brand-all]");
      if (allBtn) {
        activeBrands.clear();
      } else {
        const btn = e.target.closest(".filter-option-check[data-brand]");
        if (!btn) return;
        const brand = btn.dataset.brand;
        if (activeBrands.has(brand)) {
          activeBrands.delete(brand);
        } else {
          activeBrands.add(brand);
        }
      }
      renderBrands();
      renderCategories(); // la lista de categorías depende de las marcas elegidas
      renderProducts();
      renderFilterSheetBody(filterSheetSearch.value);
      updateFilterSheetApplyLabel();
      // multi-selección: la hoja queda abierta para elegir varias marcas
    }
  });

  filterSheetClearBtn.addEventListener("click", () => {
    if (filterSheetType === "cat") {
      activeCategory = "Todos";
      renderCategories();
      renderBrands(); // "Todos" vuelve a mostrar todas las marcas
    } else if (filterSheetType === "brand") {
      activeBrands.clear();
      renderBrands();
      renderCategories(); // sin marcas activas, vuelven a verse todas las categorías
    }
    renderProducts();
    renderFilterSheetBody(filterSheetSearch.value);
    updateFilterSheetApplyLabel();
  });

  filterSheetApplyBtn.addEventListener("click", closeFilterSheet);

  // Evita un dropdown mal posicionado si se redimensiona la ventana
  // (p. ej. rotar el celular, o cruzar el breakpoint mobile/desktop).
  window.addEventListener("resize", debounce(closeFilterSheet, 150));

  // En desktop el dropdown está anclado (position: fixed) a la posición del
  // botón en el momento de abrirse. Si el usuario scrollea la página, el
  // botón se mueve pero el panel queda flotando en el mismo lugar de la
  // pantalla, dando la sensación de que "lo sigue" a todos lados. Para
  // evitarlo, lo cerramos apenas se detecta scroll de la página.
  // (En mobile no aplica: el fondo queda bloqueado con lockBodyScroll mientras la hoja está abierta).
  window.addEventListener(
    "scroll",
    (e) => {
      // Solo nos interesa el scroll de la página (target === document).
      // El scroll interno del panel (filterSheetBody, con su propio overflow)
      // dispara su propio evento "scroll" con target distinto de document,
      // y no debe cerrar el panel.
      if (e.target !== document) return;
      if (isFilterSheetOpen() && filterSheet.classList.contains("dropdown")) {
        closeFilterSheet();
      }
    },
    { passive: true, capture: true }
  );
}

// ──────────────────────────────────────────────────────────
// FILTRADO Y RENDER DE PRODUCTOS
// ──────────────────────────────────────────────────────────

// Lleva el scroll al inicio de la sección de catálogo. Se usa cada vez que
// se cambia de categoría o marca, para que el usuario siempre vea los
// resultados desde arriba (evita que quede "en blanco" si el filtro
// elegido tiene pocos productos y la página estaba scrolleada más abajo).
function scrollToCatalog() {
  const catalogSection = document.getElementById("catalogo");
  if (!catalogSection) return;
  const offset = 88; // altura del nav fijo
  const top = catalogSection.getBoundingClientRect().top + window.scrollY - offset;
  window.scrollTo({ top, behavior: "smooth" });
}

function getFilteredProducts() {
  const filtered = allProducts.filter((p) => {
    if (activeCategory !== "Todos" && p.category !== activeCategory) return false;
    if (activeBrands.size > 0 && !activeBrands.has(p.brand)) return false;
    if (activeTag) {
      // Soporta campo tags[] nuevo y tag string legacy
      const hasTag = Array.isArray(p.tags) && p.tags.length > 0
        ? p.tags.some(t => t.trim().toLowerCase() === activeTag.toLowerCase())
        : (p.tag || "").trim().toLowerCase() === activeTag.toLowerCase();
      if (!hasTag) return false;
    }
    if (searchTerm) {
      // El "haystack" ahora incluye nombre, descripción, categoría, marca
      // y tags, así buscar "chocolates" también encuentra productos cuya
      // categoría es "Chocolates" aunque esa palabra no esté en el nombre.
      const tagsText = Array.isArray(p.tags) ? p.tags.join(" ") : (p.tag || "");
      const haystack = normalizeText(
        `${p.name || ""} ${p.description || ""} ${p.category || ""} ${p.brand || ""} ${tagsText}`
      );

      // Se exige que TODAS las palabras escritas por el usuario matcheen
      // (en alguna de sus variantes singular/plural) en algún lugar del
      // haystack. Así "caramelos menta" encuentra "Caramelo de Menta".
      const tokens = normalizeText(searchTerm).split(/\s+/).filter(Boolean);
      const matchesAll = tokens.every((token) =>
        [...wordVariants(token)].some((variant) => haystack.includes(variant))
      );
      if (!matchesAll) return false;
    }
    return true;
  });

  // Ordenamos alfabéticamente por categoría (y dentro de cada categoría
  // respetamos el orden configurado order/nombre), tanto si no hay
  // filtro activo como si se filtra por marca o categoría.
  const sorted = [...filtered].sort(sortByCategoryThenOrder);

  // Los productos agotados (active === false) siempre van al final.
  // Al separar y concatenar preservamos el orden alfabético por
  // categoría dentro de cada grupo: los disponibles arriba, los
  // agotados abajo. Si un producto se marca disponible de nuevo desde
  // el admin, vuelve automáticamente a su lugar entre los disponibles.
  const available = sorted.filter((p) => p.active !== false);
  const soldOut = sorted.filter((p) => p.active === false);
  return [...available, ...soldOut];
}

// ──────────────────────────────────────────────────────────
// RENDER: TAG PILLS
// ──────────────────────────────────────────────────────────

// Orden canónico de tags. Los que no estén en la lista van al final.
const TAG_ORDER = [
  "Nuevo",
  "Importado",
  "Oferta",
  "Destacado",
  "Liquidación",
  "Ultimas Unidades",
];

function renderTagPills() {
  if (!tagPillsContainer || !tagPillsWrap) return;

  // Recolectar tags únicos de productos activos — soporta tags[] array y tag string legacy
  const tagsSet = new Set();
  allProducts
    .filter((p) => p.active !== false)
    .forEach((p) => {
      if (Array.isArray(p.tags) && p.tags.length > 0) {
        p.tags.forEach(t => { if (t && t.trim()) tagsSet.add(t.trim()); });
      } else if (p.tag && p.tag.trim()) {
        tagsSet.add(p.tag.trim());
      }
    });

  if (tagsSet.size === 0) {
    tagPillsWrap.style.display = "none";
    return;
  }

  // Ordenar según TAG_ORDER; los desconocidos van al final en orden alfabético
  const tags = Array.from(tagsSet).sort((a, b) => {
    const idxA = TAG_ORDER.findIndex((t) => t.toLowerCase() === a.toLowerCase());
    const idxB = TAG_ORDER.findIndex((t) => t.toLowerCase() === b.toLowerCase());
    const rankA = idxA === -1 ? TAG_ORDER.length : idxA;
    const rankB = idxB === -1 ? TAG_ORDER.length : idxB;
    if (rankA !== rankB) return rankA - rankB;
    return a.localeCompare(b, "es");
  });

  tagPillsWrap.style.display = "flex";

  // Botón "Limpiar filtro" — solo visible cuando hay un tag activo
  const clearBtn = activeTag
    ? `<button class="tag-pill-clear" id="tagPillClear" aria-label="Quitar filtro de tag">
        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.8">
          <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
        </svg>
        Quitar filtro
      </button>`
    : "";

  tagPillsContainer.innerHTML =
    clearBtn +
    tags
      .map((tag) => {
        const isActive = activeTag && activeTag.toLowerCase() === tag.toLowerCase();
        return `<button class="tag-pill${isActive ? " active" : ""}" data-tag="${escapeHtml(tag)}">
          <span class="tag-dot"></span>
          ${escapeHtml(tag)}
        </button>`;
      })
      .join("");

  // Listener del botón limpiar
  const clearEl = document.getElementById("tagPillClear");
  if (clearEl) {
    clearEl.addEventListener("click", () => {
      activeTag = null;
      renderTagPills();
      renderProducts();
    });
  }
}

function productCardHtml(product) {
  const { bg, inner } = getProductVisual(product);
  const isOutOfStock = product.active === false;

  // Badge "Agotado" tiene prioridad; si hay tags y está disponible, se muestran esos
  const tagInner = isOutOfStock
    ? `<span class="card-tag card-tag-soldout">Agotado</span>`
    : (() => {
        const tagsArr = Array.isArray(product.tags) && product.tags.length > 0
          ? product.tags
          : (product.tag ? [product.tag] : []);
        return tagsArr.map(t => `<span class="card-tag">${escapeHtml(t)}</span>`).join("");
      })();
  const tag = tagInner ? `<div class="card-tags">${tagInner}</div>` : "";

  // Imagen y nombre solo clickeables si el producto está disponible
  const imgDataAttr = isOutOfStock ? "" : ` data-id="${product.id}"`;
  const nameDataAttr = isOutOfStock ? "" : ` data-id="${product.id}"`;

  // Botón: deshabilitado si está agotado
  const actionBtn = isOutOfStock
    ? `<button type="button" class="btn-cart btn-soldout" disabled>
         <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
           <path stroke-linecap="round" stroke-linejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"/>
         </svg>
         Agotado
       </button>`
    : `<button type="button" class="btn-cart btn-details" data-id="${product.id}">Ver producto</button>`;

  return `
    <div class="product-card${isOutOfStock ? " product-card-soldout" : ""}" data-id="${product.id}">
      <div class="card-img ${bg}"${imgDataAttr}>
        ${tag}
        ${inner}
      </div>
      <div class="card-body">
        <p class="card-cat"><span class="card-cat-text">${escapeHtml(product.category || "")}</span>${product.brand ? ` <span class="card-cat-brand">· ${escapeHtml(product.brand)}</span>` : ""}</p>
        <h3 class="card-name"${nameDataAttr}>${escapeHtml(product.name || "")}</h3>
        <p class="card-desc">${escapeHtml(product.description || "")}</p>
        ${actionBtn}
      </div>
    </div>`;
}

function renderProducts(resetPagination = true) {
  if (!productsLoaded) {
    renderProductSkeletons();
    return;
  }

  if (allProducts.length === 0) {
    productGrid.innerHTML = `
      <div class="state-msg">
        <strong>Todavía no hay productos cargados</strong>
        <span>Muy pronto vamos a sumar todo nuestro catálogo. ¡Volvé a visitarnos!</span>
      </div>`;
    return;
  }

  const filtered = getFilteredProducts();

  if (filtered.length === 0) {
    productGrid.innerHTML = `
      <div class="state-msg">
        <strong>No encontramos productos</strong>
        <span>Probá cambiar los filtros o la búsqueda.</span>
      </div>`;
    return;
  }

  // Al cambiar filtros/búsqueda siempre volvemos a mostrar desde el principio
  if (resetPagination) {
    productsVisible = PRODUCTS_PER_PAGE;
  }

  const visible = filtered.slice(0, productsVisible);
  const remaining = filtered.length - productsVisible;

  const cardsHtml = visible.map(productCardHtml).join("");

  const endMsgHtml = remaining <= 0 && filtered.length > PRODUCTS_PER_PAGE
    ? `<div class="end-of-catalog">Ya viste todos nuestros productos</div>`
    : "";

  productGrid.innerHTML = cardsHtml + endMsgHtml;
  isLoadingMoreProducts = false;

  // El sentinel vive fuera de productGrid (no se borra en el re-render).
  // Lo activamos/desactivamos según si quedan más productos por cargar.
  setupInfiniteScroll(remaining > 0);
}

// ──────────────────────────────────────────────────────────
// SCROLL INFINITO: observa el sentinel y va agregando productos
// con un pequeño efecto skeleton a medida que el usuario baja.
// ──────────────────────────────────────────────────────────
function setupInfiniteScroll(hasMore) {
  const sentinel = document.getElementById("infiniteScrollSentinel");
  if (!sentinel) return;

  if (!infiniteScrollObserver) {
    infiniteScrollObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) loadMoreProducts();
        });
      },
      { root: null, rootMargin: "600px 0px", threshold: 0 }
    );
  }

  infiniteScrollObserver.unobserve(sentinel);
  if (hasMore) infiniteScrollObserver.observe(sentinel);
}

function loadMoreProducts() {
  if (isLoadingMoreProducts) return;
  const filtered = getFilteredProducts();
  const remaining = filtered.length - productsVisible;
  if (remaining <= 0) return;

  isLoadingMoreProducts = true;

  // Mostramos skeletons de la próxima tanda mientras "carga" (son productos
  // que ya están en memoria, así que esto es solo un efecto visual breve
  // para que la transición se sienta natural y no un salto brusco de golpe).
  const nextBatchSize = Math.min(PRODUCTS_PER_PAGE, remaining);
  const skeletonsHtml = Array.from({ length: nextBatchSize }).map(skeletonCardHtml).join("");
  productGrid.insertAdjacentHTML("beforeend", skeletonsHtml);

  setTimeout(() => {
    productsVisible += PRODUCTS_PER_PAGE;
    renderProducts(false);
  }, 350);
}

// ──────────────────────────────────────────────────────────
// MODAL DE DETALLE DE PRODUCTO (con variantes)
// ──────────────────────────────────────────────────────────

/**
 * Devuelve todas las variantes de un producto (incluyéndolo a él mismo).
 * Las variantes se agrupan por el campo "group": productos con el mismo
 * valor de "group" se muestran juntos en el modal (ej: un mismo alfajor
 * en presentación blanca y negra).
 */
function getVariantGroup(product) {
  if (!product.group) return [product];
  const group = allProducts.filter((p) => p.group === product.group);
  return group.length > 0 ? group : [product];
}

/** Texto corto para identificar una variante dentro del modal. */
function getVariantLabel(product) {
  return product.variantLabel || product.tag || product.name || "Variante";
}

function modalContentHtml(product) {
  const { bg, inner } = getProductVisual(product);
  const tagInner = (() => {
    const tagsArr = Array.isArray(product.tags) && product.tags.length > 0
      ? product.tags
      : (product.tag ? [product.tag] : []);
    return tagsArr.map(t => `<span class="card-tag">${escapeHtml(t)}</span>`).join("");
  })();
  const tag = tagInner ? `<div class="card-tags">${tagInner}</div>` : "";
  const variants = getVariantGroup(product);

  // Modalidades de venta habilitadas para este producto. Si el producto
  // no tiene el campo (catálogo cargado antes de esta función), se
  // asumen ambas disponibles para no restringir nada por default.
  const saleModes = Array.isArray(product.saleModes) && product.saleModes.length > 0
    ? product.saleModes
    : ["unidad", "caja"];
  const canUnidad = saleModes.includes("unidad");
  const canCaja = saleModes.includes("caja");
  // Tipo de unidad que se usa si no hay selector visible (una sola opción).
  const defaultUnitType = canUnidad ? "unidad" : "caja";

  // Selector "por unidad" / "por caja": solo para clientes mayoristas,
  // y solo si el producto admite ambas modalidades.
  const showUnitSelector = buyerType === "mayorista" && canUnidad && canCaja;
  const unitSelectorHtml = showUnitSelector
    ? `<div class="modal-unit-row" data-selected-unit="unidad">
         <span class="modal-qty-label">Comprar por</span>
         <div class="modal-unit-pills">
           <button type="button" class="unit-pill active" data-unit="unidad">Unidad</button>
           <button type="button" class="unit-pill" data-unit="caja">Caja</button>
         </div>
       </div>`
    : (buyerType === "mayorista" && canCaja && !canUnidad
        ? `<div class="modal-unit-note">Este producto se vende únicamente por caja</div>`
        : "");

  // Siempre: stepper de cantidad + botón agregar
  const cartActionHtml = `
    ${unitSelectorHtml}
    <div class="modal-qty-row">
      <span class="modal-qty-label">Cantidad</span>
      <div class="modal-qty-stepper">
        <button type="button" class="modal-qty-btn modal-qty-dec" aria-label="Restar">−</button>
        <span class="modal-qty-val" id="modalQtyVal">1</span>
        <button type="button" class="modal-qty-btn modal-qty-inc" aria-label="Sumar">+</button>
      </div>
      <button type="button" class="btn-cart-qty btn-add" data-id="${product.id}" data-unit-type="${defaultUnitType}">
        Agregar al pedido
      </button>
    </div>`;

  const variantsHtml = variants.length > 1
    ? `<div class="modal-variants">
         <div class="modal-variants-label">Variantes disponibles</div>
         <div class="modal-variants-list">
           ${variants
             .map(
               (v) => `
             <button type="button" class="variant-pill${v.id === product.id ? " active" : ""}" data-id="${v.id}">
               ${escapeHtml(getVariantLabel(v))}
             </button>`
             )
             .join("")}
         </div>
       </div>`
    : "";

  return `
    <div class="modal-grid">
      <div class="modal-img ${bg}">
        ${tag}
        ${inner}
      </div>
      <div class="modal-info">
        <p class="card-cat">${escapeHtml(product.category || "")}</p>
        <h3 class="modal-name">${escapeHtml(product.name || "")}</h3>
        ${product.brand ? `<p class="modal-brand">${escapeHtml(product.brand)}</p>` : ""}
        <p class="modal-desc">${escapeHtml(product.description || "Sin descripción disponible.")}</p>
        ${variantsHtml}
        <div class="modal-action">${cartActionHtml}</div>
      </div>
    </div>`;
}

function renderModalProduct(productId) {
  const product = allProducts.find((p) => p.id === productId);
  if (!product) return;
  modalBody.innerHTML = modalContentHtml(product);
}

// ── Bloqueo de scroll compatible con iOS Safari ──────────
let _scrollY = 0;
function lockBodyScroll() {
  _scrollY = window.scrollY;
  document.body.style.position = "fixed";
  document.body.style.top = `-${_scrollY}px`;
  document.body.style.left = "0";
  document.body.style.right = "0";
  document.body.style.overflow = "hidden";
}
function unlockBodyScroll() {
  // Solo restaurar si el body realmente está bloqueado (evita scroll al top involuntario)
  if (document.body.style.position !== "fixed") return;
  document.body.style.position = "";
  document.body.style.top = "";
  document.body.style.left = "";
  document.body.style.right = "";
  document.body.style.overflow = "";
  window.scrollTo(0, _scrollY);
}

function openProductModal(productId) {
  const product = allProducts.find((p) => p.id === productId);
  if (!product) return;
  // No abrir el modal si el producto está agotado (inactivo)
  if (product.active === false) return;
  closeCart();
  renderModalProduct(productId);
  modalOverlay.classList.add("open");
  productModal.classList.add("open");
  lockBodyScroll();
}

function closeProductModal() {
  // Guard: no hacer nada si el modal no está abierto
  if (!productModal.classList.contains("open")) return;
  modalOverlay.classList.remove("open");
  productModal.classList.remove("open");
  unlockBodyScroll();
  closeLightbox();
}

function isModalOpen() {
  return productModal.classList.contains("open");
}

/** Abre la imagen del producto en grande, dentro de un marco de tamaño fijo. */
function openLightbox(src, alt = "") {
  if (!src) return;
  lightboxImg.src = src;
  lightboxImg.alt = alt;
  lightboxOverlay.classList.add("open");
}

function closeLightbox() {
  lightboxOverlay.classList.remove("open");
  lightboxImg.src = "";
}

// ──────────────────────────────────────────────────────────
// CARRITO: UI
// ──────────────────────────────────────────────────────────

function updateCartBadge() {
  const totalUnits = getTotalUnits();
  cartBadge.textContent = totalUnits;
  cartBadge.style.display = totalUnits > 0 ? "flex" : "none";
}

function cartItemHtml(item) {
  const visual = getProductVisual(item);
  const imgHtml = item.image
    ? `<img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.name)}">`
    : `<div class="card-img ${visual.bg}" style="width:100%;height:100%;">${visual.inner.replace(/width="72" height="72"/, 'width="28" height="28"')}</div>`;

  // Verificar si el producto sigue activo en el catálogo actual
  // (item.productId es el id real del producto; item.id puede ser una
  // clave compuesta como "id::caja" cuando la línea es "por caja")
  const liveProduct = allProducts.find((p) => p.id === (item.productId || item.id));
  const isSoldOut = !liveProduct || liveProduct.active === false;
  const unitBadge = buyerType === "mayorista"
    ? (item.unitType === "caja"
        ? `<span class="cart-item-unit">Por caja</span>`
        : `<span class="cart-item-unit cart-item-unit-single">Por unidad</span>`)
    : "";

  if (isSoldOut) {
    return `
      <div class="cart-item cart-item-soldout" data-id="${item.id}">
        <div class="cart-item-img" style="opacity:0.45;filter:grayscale(60%);">${imgHtml}</div>
        <div class="cart-item-info">
          <div class="cart-item-name" style="opacity:0.5;">${escapeHtml(item.name)}</div>
          <div class="cart-item-cat" style="color:var(--red);font-weight:700;">Agotado — se quitará del pedido</div>
        </div>
        <button type="button" class="cart-item-remove" data-id="${item.id}" aria-label="Quitar producto">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      </div>`;
  }

  return `
    <div class="cart-item" data-id="${item.id}">
      <div class="cart-item-img">${imgHtml}</div>
      <div class="cart-item-info">
        <div class="cart-item-name">${escapeHtml(item.name)}</div>
        <div class="cart-item-cat">${escapeHtml(item.category || "")}${unitBadge}</div>
      </div>
      <div class="cart-item-qty">
        <button type="button" class="cart-qty-minus" data-id="${item.id}" aria-label="Restar">−</button>
        <span>${item.qty}</span>
        <button type="button" class="cart-qty-plus" data-id="${item.id}" aria-label="Sumar">+</button>
      </div>
      <button type="button" class="cart-item-remove" data-id="${item.id}" aria-label="Quitar producto">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
        </svg>
      </button>
    </div>`;
}

function renderCart() {
  const cart = getCart();
  const items = Object.values(cart);

  if (items.length === 0) {
    cartBody.innerHTML = `
      <div class="cart-empty">
        <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"/>
        </svg>
        <strong>Tu pedido está vacío</strong>
        <span>Agregá productos del catálogo para armar tu pedido.</span>
      </div>`;
    cartFooter.style.display = "none";
  } else {
    cartBody.innerHTML = items.map(cartItemHtml).join("");
    cartFooter.style.display = "flex";
    cartTotalLines.textContent = getTotalLines(cart);
    cartTotalUnits.textContent = getTotalUnits(cart);
  }

  updateCartBadge();
}

function isCartOpen() {
  return cartDrawer.classList.contains("open");
}

function openCart() {
  renderCart();
  cartOverlay.classList.add("open");
  cartDrawer.classList.add("open");
  lockBodyScroll();
}

function closeCart() {
  cartOverlay.classList.remove("open");
  cartDrawer.classList.remove("open");
  unlockBodyScroll();
}

// ──────────────────────────────────────────────────────────
// CARRITO: ACCIONES
// ──────────────────────────────────────────────────────────

function handleAddToCart(productId, qty = 1, unitType = "unidad") {
  const product = allProducts.find((p) => p.id === productId);
  if (!product) return;
  // Bloquear si el producto está agotado (inactivo)
  if (product.active === false) return;
  addToCart(product, qty, unitType);
  updateCartBadge();
  // Resetear stepper del modal a 1 sin re-renderizar todo el contenido
  const valEl = modalBody.querySelector("#modalQtyVal");
  if (valEl) valEl.textContent = "1";
  // Resetear también el selector de unidad/caja a su valor por defecto
  const unitRow = modalBody.querySelector(".modal-unit-row");
  if (unitRow) {
    unitRow.dataset.selectedUnit = "unidad";
    unitRow.querySelectorAll(".unit-pill").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.unit === "unidad");
    });
  }
  let label;
  if (unitType === "caja") {
    label = qty > 1 ? `${qty} cajas agregadas al pedido ✓` : "1 caja agregada al pedido ✓";
  } else {
    label = qty > 1 ? `${qty} unidades agregadas al pedido ✓` : "Agregado al pedido ✓";
  }
  showToast(product.name, "ok", label);
}

function handleChangeQty(cartKey, delta, rerenderTarget) {
  // La clave del carrito puede ser el id del producto (unidad) o
  // "id::caja" (caja); guardamos el id real del producto antes de
  // tocar el carrito, para poder re-renderizar el modal si aplica.
  const productId = getCart()[cartKey]?.productId || cartKey;
  changeQty(cartKey, delta);
  updateCartBadge();
  if (rerenderTarget === "cart") renderCart();
  if (rerenderTarget === "grid") renderProducts();
  if (isModalOpen()) renderModalProduct(productId);
}

function handleRemove(cartKey) {
  const productId = getCart()[cartKey]?.productId || cartKey;
  removeFromCart(cartKey);
  updateCartBadge();
  renderCart();
  renderProducts();
  if (isModalOpen()) renderModalProduct(productId);
}

// ──────────────────────────────────────────────────────────
// QR MODAL (desktop) / WHATSAPP DIRECTO (mobile)
// ──────────────────────────────────────────────────────────

// Genera el QR en el canvas usando la API pública de QR Server
// sin dependencias npm — solo una <img> generada por URL.
function renderQRCode(url) {
  const canvas = document.getElementById("qrCanvas");
  if (!canvas) return;

  // Usamos la API pública qrserver.com (sin límite para uso personal)
  const size = 200;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(url)}&margin=0&format=png`;

  // Convertir canvas a img dinámica
  const frame = document.getElementById("qrFrame");
  // Eliminar canvas y reemplazar por img si ya existe
  canvas.remove();

  // Mostrar loader mientras carga
  const loader = document.getElementById("qrLoader");
  if (loader) loader.style.display = "flex";

  let img = frame.querySelector("img.qr-img");
  if (!img) {
    img = document.createElement("img");
    img.className = "qr-img";
    img.width = size;
    img.height = size;
    img.style.borderRadius = "8px";
    img.style.display = "none"; // Oculta hasta que cargue
    // Insertar antes del primer qr-corner
    frame.insertBefore(img, frame.querySelector(".qr-corner"));
  } else {
    img.style.display = "none"; // Ocultar mientras recarga
  }

  img.onload = () => {
    if (loader) loader.style.display = "none";
    img.style.display = "block";
  };
  img.onerror = () => {
    if (loader) {
      loader.innerHTML = `<span style="font-size:0.8rem;color:var(--red);text-align:center;padding:0 1rem">No se pudo generar el QR.<br>Usá el botón de abajo.</span>`;
    }
  };

  img.src = qrUrl;
  img.alt = "QR código de WhatsApp";
}

const qrModalOverlay = document.getElementById("qrModalOverlay");
const qrModalClose   = document.getElementById("qrModalClose");
const qrWaWebBtn     = document.getElementById("qrWaWebBtn");

// Diálogo "¿Ya enviaste tu pedido?" que aparece al intentar cerrar el modal QR.
// Existe porque no hay forma de detectar automáticamente si el cliente
// escaneó el QR con el celular y envió el mensaje: se le pregunta explícitamente
// para decidir si el carrito debe vaciarse o no.
const qrConfirmDialogOverlay = document.getElementById("qrConfirmDialogOverlay");
const qrConfirmCancel = document.getElementById("qrConfirmCancel");
const qrConfirmSend   = document.getElementById("qrConfirmSend");

function openQrModal(waUrl) {
  renderQRCode(waUrl);
  if (qrWaWebBtn) qrWaWebBtn.href = waUrl;
  if (qrModalOverlay) qrModalOverlay.classList.add("open");
  lockBodyScroll();
}

// Cierre "silencioso" del modal QR, sin preguntar nada.
// Se usa solo cuando ya sabemos que el pedido se envió (ej: click en
// "Abrir en WhatsApp Web") o cuando se cancela desde el diálogo de confirmación.
function closeQrModal() {
  if (!qrModalOverlay || !qrModalOverlay.classList.contains("open")) return;
  qrModalOverlay.classList.remove("open");
  unlockBodyScroll();
}

function openQrConfirmDialog() {
  if (qrConfirmDialogOverlay) qrConfirmDialogOverlay.classList.add("open");
}

function closeQrConfirmDialog() {
  if (qrConfirmDialogOverlay) qrConfirmDialogOverlay.classList.remove("open");
}

// El modal QR solo puede cerrarse presionando la X (no con click afuera
// ni con Escape), y al presionarla se pregunta si el pedido ya fue enviado
// antes de vaciar el carrito.
function setupQrModalListeners() {
  if (!qrModalOverlay) return;

  if (qrModalClose) {
    qrModalClose.addEventListener("click", openQrConfirmDialog);
  }

  if (qrConfirmCancel) {
    qrConfirmCancel.addEventListener("click", () => {
      // Todavía no lo envió: se queda en el modal QR.
      closeQrConfirmDialog();
    });
  }

  if (qrConfirmDialogOverlay) {
    qrConfirmDialogOverlay.addEventListener("click", (e) => {
      if (e.target === qrConfirmDialogOverlay) closeQrConfirmDialog();
    });
  }

  if (qrConfirmSend) {
    qrConfirmSend.addEventListener("click", () => {
      // Confirmó que ya lo envió: se vacía el carrito y se cierra todo.
      closeQrConfirmDialog();
      closeQrModal();
      afterOrderSent();
    });
  }

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (qrConfirmDialogOverlay && qrConfirmDialogOverlay.classList.contains("open")) {
      closeQrConfirmDialog();
    }
    // Nota: Escape ya NO cierra el modal QR directamente, para evitar
    // que se pierda el pedido por accidente sin confirmar el envío.
  });
}

// ──────────────────────────────────────────────────────────
// TIPO DE COMPRA (mayorista / minorista)
// ──────────────────────────────────────────────────────────

function getSavedBuyerType() {
  try {
    const saved = localStorage.getItem(BUYER_TYPE_KEY);
    return saved === "mayorista" || saved === "minorista" ? saved : null;
  } catch (error) {
    return null;
  }
}

function saveBuyerType(type) {
  try {
    localStorage.setItem(BUYER_TYPE_KEY, type);
  } catch (error) {
    // Si el navegador bloquea localStorage, seguimos solo con el estado en memoria.
  }
}

function updateBuyerTypeUI() {
  const label = buyerType ? BUYER_TYPE_LABELS[buyerType] : null;
  const statusText = label ? `Comprando como ${label}` : "Elegí cómo comprar";

  if (heroBuyerStatusText) heroBuyerStatusText.textContent = statusText;
  if (mobileMenuBuyerText) mobileMenuBuyerText.textContent = statusText;
  if (cartBuyerBadge) cartBuyerBadge.textContent = label || "Elegir";

  if (buyerOptionMayorista) buyerOptionMayorista.classList.toggle("active", buyerType === "mayorista");
  if (buyerOptionMinorista) buyerOptionMinorista.classList.toggle("active", buyerType === "minorista");

  // El botón de cerrar el modal solo se muestra si ya hay un tipo elegido
  // (la primera vez es obligatorio elegir uno).
  if (buyerModalCloseBtn) buyerModalCloseBtn.style.display = buyerType ? "flex" : "none";
}

function openBuyerTypeModal() {
  if (!buyerModalOverlay) return;
  updateBuyerTypeUI();
  buyerModalOverlay.classList.add("open");
  lockBodyScroll();
}

function closeBuyerTypeModal() {
  if (!buyerModalOverlay) return;
  // No se puede cerrar sin elegir un tipo de compra la primera vez.
  if (!buyerType) return;
  buyerModalOverlay.classList.remove("open");
  unlockBodyScroll();
}

function selectBuyerType(type) {
  buyerType = type;
  saveBuyerType(type);
  updateBuyerTypeUI();
  buyerModalOverlay.classList.remove("open");
  unlockBodyScroll();
  showToast(`Modo ${BUYER_TYPE_LABELS[type]} activado`, "success", "Lo vamos a tener en cuenta al recibir tu pedido");
  // El carrito puede tener líneas "por caja", que en Minorista no
  // se muestran; hay que refrescar el carrito y la grilla para que
  // la vista quede consistente con el nuevo tipo de compra.
  updateCartBadge();
  if (isCartOpen()) renderCart();
  renderProducts();
}

// Tipo de compra pendiente de confirmar (mientras está abierto el
// diálogo de "el carrito se va a vaciar").
let pendingBuyerType = null;

const buyerChangeConfirmOverlay = document.getElementById("buyerChangeConfirmOverlay");
const buyerChangeConfirmCancel = document.getElementById("buyerChangeConfirmCancel");
const buyerChangeConfirmAccept = document.getElementById("buyerChangeConfirmAccept");

function openBuyerChangeConfirmDialog(targetType) {
  if (!buyerChangeConfirmOverlay) return;
  const titleEl = document.getElementById("buyerChangeConfirmTitle");
  const msgEl = document.getElementById("buyerChangeConfirmMsg");
  if (targetType === "minorista") {
    if (msgEl) {
      msgEl.textContent = 'Minorista no tiene la opción "por caja". Si cambiás ahora, se van a quitar los productos que ya cargaste como Mayorista.';
    }
  } else {
    if (msgEl) {
      msgEl.textContent = "Al cambiar a Mayorista se van a quitar los productos que ya cargaste como Minorista, para que puedas armar el pedido de nuevo eligiendo unidad o caja.";
    }
  }
  if (titleEl) titleEl.textContent = "El carrito se va a vaciar";
  buyerChangeConfirmOverlay.classList.add("open");
}

function closeBuyerChangeConfirmDialog() {
  if (buyerChangeConfirmOverlay) buyerChangeConfirmOverlay.classList.remove("open");
  pendingBuyerType = null;
}

/**
 * Se llama al elegir un tipo de compra desde el modal. Mayorista y
 * Minorista manejan el carrito distinto (Minorista no tiene "por
 * caja"), así que si el cliente ya tenía productos cargados y cambia
 * de un tipo a otro, se le avisa que el carrito se va a vaciar.
 */
function handleBuyerTypeSelect(type) {
  const hasItems = getTotalLines() > 0;
  const isRealChange = buyerType && buyerType !== type;
  if (isRealChange && hasItems) {
    pendingBuyerType = type;
    openBuyerChangeConfirmDialog(type);
    return;
  }
  selectBuyerType(type);
}

function setupBuyerChangeConfirmListeners() {
  if (!buyerChangeConfirmOverlay) return;
  if (buyerChangeConfirmCancel) {
    buyerChangeConfirmCancel.addEventListener("click", closeBuyerChangeConfirmDialog);
  }
  buyerChangeConfirmOverlay.addEventListener("click", (e) => {
    if (e.target === buyerChangeConfirmOverlay) closeBuyerChangeConfirmDialog();
  });
  if (buyerChangeConfirmAccept) {
    buyerChangeConfirmAccept.addEventListener("click", () => {
      const type = pendingBuyerType;
      closeBuyerChangeConfirmDialog();
      if (!type) return;
      clearCart();
      selectBuyerType(type);
    });
  }
}

function closeMobileMenuForBuyerChange() {
  const mobileMenu = document.getElementById("mobileMenu");
  const mobileMenuOverlay = document.getElementById("mobileMenuOverlay");
  if (mobileMenu) mobileMenu.classList.remove("open");
  if (mobileMenuOverlay) mobileMenuOverlay.classList.remove("open");
}

function setupBuyerTypeListeners() {
  if (!buyerModalOverlay) return;

  if (buyerOptionMayorista) {
    buyerOptionMayorista.addEventListener("click", () => handleBuyerTypeSelect("mayorista"));
  }
  if (buyerOptionMinorista) {
    buyerOptionMinorista.addEventListener("click", () => handleBuyerTypeSelect("minorista"));
  }
  if (buyerModalCloseBtn) {
    buyerModalCloseBtn.addEventListener("click", closeBuyerTypeModal);
  }
  buyerModalOverlay.addEventListener("click", (e) => {
    if (e.target === buyerModalOverlay) closeBuyerTypeModal();
  });
  if (heroBuyerChangeBtn) {
    heroBuyerChangeBtn.addEventListener("click", openBuyerTypeModal);
  }
  if (mobileMenuBuyerChangeBtn) {
    mobileMenuBuyerChangeBtn.addEventListener("click", () => {
      closeMobileMenuForBuyerChange();
      openBuyerTypeModal();
    });
  }
  if (cartBuyerBadge) {
    cartBuyerBadge.addEventListener("click", openBuyerTypeModal);
  }
}

// ──────────────────────────────────────────────────────────
// MODAL CONTACTANOS
// ──────────────────────────────────────────────────────────
// Reemplaza el viejo botón "Contactanos" que hacía scroll al footer:
// con el scroll infinito de productos, el footer se sigue corriendo
// hacia abajo mientras el usuario baja, así que la navegación por ancla
// ya no llega bien. En su lugar abrimos un modal con los datos de
// contacto (ubicación, WhatsApp e Instagram) accesible desde cualquier
// parte de la página.

// Formatea el número guardado (ej: "5493735627215") en un formato
// legible tipo "+54 9 3735 62-7215". Si el formato no matchea, se
// muestra el número tal cual viene.
function formatWhatsappDisplay(number) {
  const digits = String(number || "").replace(/\D/g, "");
  const match = digits.match(/^54(9)?(\d{2,4})(\d{6,8})$/);
  if (!match) return number;
  const [, nine, area, line] = match;
  const lineFormatted = line.length === 8 ? `${line.slice(0, 2)}-${line.slice(2)}` : line;
  return `+54 ${nine ? "9 " : ""}${area} ${lineFormatted}`;
}

async function openContactModal() {
  if (!contactModalOverlay) return;
  contactModalOverlay.classList.add("open");
  lockBodyScroll();

  // Traemos el número más actualizado desde Firestore recién al abrir
  // el modal (igual que hace el botón flotante de WhatsApp).
  if (contactWaBtn) {
    const number = await fetchWhatsappNumber();
    const message = "¡Hola! Quería hacer una consulta sobre los productos de Marchese Golosinas 😊";
    contactWaBtn.href = `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
    if (contactWaNumber) contactWaNumber.textContent = formatWhatsappDisplay(number);
  }
}

function closeContactModal() {
  if (!contactModalOverlay) return;
  contactModalOverlay.classList.remove("open");
  unlockBodyScroll();
}

function isContactModalOpen() {
  return !!(contactModalOverlay && contactModalOverlay.classList.contains("open"));
}

function setupContactModalListeners() {
  if (!contactModalOverlay) return;

  if (contactUsBtn) {
    contactUsBtn.addEventListener("click", openContactModal);
  }
  if (contactModalCloseBtn) {
    contactModalCloseBtn.addEventListener("click", closeContactModal);
  }
  contactModalOverlay.addEventListener("click", (e) => {
    if (e.target === contactModalOverlay) closeContactModal();
  });
}

// ──────────────────────────────────────────────────────────
// DATOS DEL COMPRADOR (nombre, localidad, provincia, tel, obs)
// ──────────────────────────────────────────────────────────

function getSavedBuyerInfo() {
  try {
    const raw = localStorage.getItem(BUYER_INFO_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch (error) {
    return null;
  }
}

function saveBuyerInfo(info) {
  try {
    localStorage.setItem(BUYER_INFO_KEY, JSON.stringify(info));
  } catch (error) {
    // Si el navegador bloquea localStorage, seguimos solo con lo tipeado en pantalla.
  }
}

// Precarga el formulario del modal con los datos guardados de una visita anterior.
function fillBuyerFormFromStorage() {
  const saved = getSavedBuyerInfo();
  if (!saved) return;
  if (omBuyerName)     omBuyerName.value     = saved.name     || "";
  if (omBuyerLocality) omBuyerLocality.value = saved.locality || "";
  if (omBuyerProvince) omBuyerProvince.value = saved.province || "";
  if (omBuyerPhone)    omBuyerPhone.value    = saved.phone    || "";
  if (omBuyerNotes)    omBuyerNotes.value    = saved.notes    || "";
  // Sincronizar también los inputs ocultos legacy (usados en buildWhatsAppMessage)
  if (buyerNameInput)     buyerNameInput.value     = saved.name     || "";
  if (buyerLocalityInput) buyerLocalityInput.value = saved.locality || "";
  if (buyerProvinceInput) buyerProvinceInput.value = saved.province || "";
  if (buyerPhoneInput)    buyerPhoneInput.value    = saved.phone    || "";
  if (buyerNotesInput)    buyerNotesInput.value    = saved.notes    || "";
}

// Lee el formulario del modal, guarda, sincroniza inputs legacy y devuelve { valid, data }.
function readAndValidateBuyerForm() {
  const data = {
    name:     (omBuyerName?.value     || "").trim(),
    locality: (omBuyerLocality?.value || "").trim(),
    province: (omBuyerProvince?.value || "").trim(),
    phone:    (omBuyerPhone?.value    || "").trim(),
    notes:    (omBuyerNotes?.value    || "").trim(),
  };

  saveBuyerInfo(data);

  // Sincronizar inputs ocultos legacy (usados en buildWhatsAppMessage)
  if (buyerNameInput)     buyerNameInput.value     = data.name;
  if (buyerLocalityInput) buyerLocalityInput.value = data.locality;
  if (buyerProvinceInput) buyerProvinceInput.value = data.province;
  if (buyerPhoneInput)    buyerPhoneInput.value    = data.phone;
  if (buyerNotesInput)    buyerNotesInput.value    = data.notes;

  const requiredFields = [
    [omBuyerName,     data.name],
    [omBuyerLocality, data.locality],
    [omBuyerProvince, data.province],
  ];

  let firstInvalid = null;
  requiredFields.forEach(([el, value]) => {
    if (!el) return;
    const isInvalid = value.length === 0;
    el.classList.toggle("invalid", isInvalid);
    if (isInvalid && !firstInvalid) firstInvalid = el;
  });

  if (firstInvalid) {
    firstInvalid.focus();
    firstInvalid.scrollIntoView({ behavior: "smooth", block: "center" });
    return { valid: false, data };
  }

  return { valid: true, data };
}

function setupBuyerFormListeners() {
  // Limpiar clase invalid al tipear en los campos obligatorios del modal
  [omBuyerName, omBuyerLocality, omBuyerProvince].forEach((el) => {
    if (!el) return;
    el.addEventListener("input", () => el.classList.remove("invalid"));
  });
}


// ──────────────────────────────────────────────────────────
// WHATSAPP
// ──────────────────────────────────────────────────────────

function buildWhatsAppMessage(buyerInfo) {
  const cart = getCart();
  const items = Object.values(cart);
  const info = buyerInfo || {
    name: (buyerNameInput?.value || "").trim(),
    locality: (buyerLocalityInput?.value || "").trim(),
    province: (buyerProvinceInput?.value || "").trim(),
    phone: (buyerPhoneInput?.value || "").trim(),
    notes: (buyerNotesInput?.value || "").trim(),
  };

  let message = "";
  if (buyerType && BUYER_TYPE_WA_LABELS[buyerType]) {
    message += `*${BUYER_TYPE_WA_LABELS[buyerType]}*\n\n`;
  }
  message += "¡Hola! 👋 Quiero hacer el siguiente pedido:\n\n";

  // Datos de contacto del cliente
  message += "*Mis datos:*\n";
  if (info.name) message += `👤 Nombre: ${info.name}\n`;
  if (info.locality || info.province) {
    const lugar = [info.locality, info.province].filter(Boolean).join(", ");
    message += `📍 Localidad/Provincia: ${lugar}\n`;
  }
  if (info.phone) message += `📞 Teléfono: ${info.phone}\n`;
  if (info.notes) message += `📝 Observaciones: ${info.notes}\n`;
  message += "\n*Productos:*\n";

  items.forEach((item) => {
    const unitSuffix = buyerType === "mayorista"
      ? (item.unitType === "caja" ? " — Por caja" : " — Por unidad")
      : "";
    message += `▪ ${item.qty}x ${item.name}${unitSuffix}`;
    if (item.category) message += ` (${item.category})`;
    message += "\n";
  });
  message += `\nTotal de unidades: ${getTotalUnits(cart)}`;
  message += "\n\n¡Gracias!";
  return message;
}

// ──────────────────────────────────────────────────────────
// MODAL DE DATOS DEL PEDIDO
// ──────────────────────────────────────────────────────────

function openOrderModal() {
  if (!orderModalOverlay) return;
  // Precargar con datos guardados cada vez que se abre
  fillBuyerFormFromStorage();
  orderModalOverlay.classList.add("open");
  lockBodyScroll();
  // Foco en el primer campo vacío o en el nombre
  setTimeout(() => {
    const firstEmpty = [omBuyerName, omBuyerLocality, omBuyerProvince].find(
      (el) => el && !el.value.trim()
    );
    (firstEmpty || omBuyerName)?.focus();
  }, 320);
}

function closeOrderModal() {
  if (!orderModalOverlay || !orderModalOverlay.classList.contains("open")) return;
  orderModalOverlay.classList.remove("open");
  unlockBodyScroll();
}

function isOrderModalOpen() {
  return orderModalOverlay?.classList.contains("open") || false;
}

function setupOrderModalListeners() {
  if (!orderModalOverlay) return;

  orderModalCloseBtn?.addEventListener("click", closeOrderModal);
  orderModalOverlay.addEventListener("click", (e) => {
    if (e.target === orderModalOverlay) closeOrderModal();
  });

  orderModalSendBtn?.addEventListener("click", () => {
    const { valid } = readAndValidateBuyerForm();
    if (!valid) {
      showToast("Faltan datos", "error", "Completá nombre, localidad y provincia para continuar");
      return;
    }
    closeOrderModal();
    _checkSoldOutAndSend();
  });
}

// ──────────────────────────────────────────────────────────
// WHATSAPP: FLUJO COMPLETO
// ──────────────────────────────────────────────────────────

// Paso 1: clic en "Continuar con el pedido" del carrito
function sendOrderToWhatsApp() {
  const cart = getCart();
  if (Object.keys(cart).length === 0) {
    showToast("Pedido vacío", "error", "Agregá productos antes de enviar");
    return;
  }

  if (!buyerType) {
    showToast("Elegí cómo comprar", "error", "Decinos si es por mayor o por menor antes de enviar");
    openBuyerTypeModal();
    return;
  }

  // Abrir el modal de datos (el envío real ocurre desde adentro del modal)
  openOrderModal();
}

// Paso 2: validación de agotados y envío
function _checkSoldOutAndSend() {
  const cart = getCart();
  const soldOutItems = Object.values(cart).filter((item) => {
    const live = allProducts.find((p) => p.id === (item.productId || item.id));
    return !live || live.active === false;
  });

  if (soldOutItems.length > 0) {
    soldOutItems.forEach((item) => removeFromCart(item.id));
    updateCartBadge();
    renderCart();
    renderProducts();

    const remaining = getCart();
    if (Object.keys(remaining).length === 0) {
      showToast("Sin productos disponibles", "error", "Todos los productos de tu pedido se agotaron");
      return;
    }

    const names = soldOutItems.map((i) => i.name).join(", ");
    showToast("Productos agotados quitados", "error", `Se eliminaron del pedido: ${names}`);
    setTimeout(() => _doSendWhatsApp(), 1200);
    return;
  }

  _doSendWhatsApp();
}

async function _doSendWhatsApp() {
  const number = await fetchWhatsappNumber();
  const message = buildWhatsAppMessage();
  const waUrl = `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
  const isMobile = window.matchMedia("(max-width: 768px)").matches;

  if (isMobile) {
    // Mobile: directo a WhatsApp
    window.open(waUrl, "_blank");
    afterOrderSent();
  } else {
    // Desktop: mostrar modal con QR
    closeCart();
    openQrModal(waUrl);
  }
}

function afterOrderSent() {
  clearCart();
  updateCartBadge();
  renderCart();
  renderProducts();
  showToast("¡Pedido enviado!", "success", "El carrito fue vaciado para una nueva compra");
}

// Cuando el usuario hace click en "Abrir en WhatsApp Web" desde el modal,
// consideramos el pedido como enviado.
function setupWaWebBtnListener() {
  if (!qrWaWebBtn) return;
  qrWaWebBtn.addEventListener("click", () => {
    closeQrModal();
    afterOrderSent();
  });
}

// Botón flotante de WhatsApp (visible en toda la navegación, fuera del
// flujo de carrito): arma un saludo genérico para que cualquiera pueda
// escribir directo sin tener que armar un pedido primero.
function setupFloatingWaBtn() {
  const btn = document.getElementById("waFloatBtn");
  if (!btn) return;
  // Usamos click en lugar de href fijo para leer el número en el momento del tap
  btn.removeAttribute("href");
  btn.style.cursor = "pointer";
  btn.addEventListener("click", async (e) => {
    e.preventDefault();
    const number = await fetchWhatsappNumber();
    const message = "¡Hola! Quería hacer una consulta sobre los productos de Marchese Golosinas 😊";
    window.open(`https://wa.me/${number}?text=${encodeURIComponent(message)}`, "_blank");
  });
}

// ──────────────────────────────────────────────────────────
// FORMULARIO DE CONTACTO -> Firestore (colección "consultas")
// ──────────────────────────────────────────────────────────

async function handleContactSubmit() {
  const name = contactName.value.trim();
  const message = contactMessage.value.trim();

  contactFeedback.className = "contact-feedback";
  contactFeedback.textContent = "";

  if (!name || !message) {
    contactFeedback.classList.add("error");
    contactFeedback.textContent = "Completá tu nombre y un mensaje.";
    return;
  }

  contactSubmit.disabled = true;
  contactSubmit.textContent = "Enviando…";

  try {
    await addDoc(collection(db, "consultas"), {
      name,
      message,
      createdAt: serverTimestamp(),
      read: false,
    });
    contactFeedback.classList.add("success");
    contactFeedback.textContent = "¡Gracias! Recibimos tu consulta y te vamos a contactar pronto.";
    contactName.value = "";
    contactMessage.value = "";
  } catch (error) {
    console.error("Error enviando consulta:", error);
    contactFeedback.classList.add("error");
    contactFeedback.textContent = "No pudimos enviar tu consulta. Probá nuevamente en unos minutos.";
  } finally {
    contactSubmit.disabled = false;
    contactSubmit.textContent = "Enviar consulta";
  }
}

// ──────────────────────────────────────────────────────────
// EVENT LISTENERS
// ──────────────────────────────────────────────────────────

function setupEventListeners() {
  // Buscador
  const applySearch = debounce((value) => {
    searchTerm = value.trim().toLowerCase();
    renderProducts();
  }, 200);

  searchInput.addEventListener("input", (e) => {
    // El botón "X" aparece/desaparece al instante (no va debounceado),
    // así se siente responsivo aunque el filtrado tarde 200ms.
    updateSearchClearBtn();
    applySearch(e.target.value);
  });

  // Botón "X": borra el texto de un solo toque/click sin usar backspace.
  if (searchClearBtn) {
    searchClearBtn.addEventListener("click", () => {
      searchInput.value = "";
      searchTerm = "";
      updateSearchClearBtn();
      renderProducts();
      searchInput.focus();
    });
  }

  // Tag pills (filtro rápido por tag)
  if (tagPillsContainer) {
    tagPillsContainer.addEventListener("click", (e) => {
      const pill = e.target.closest(".tag-pill");
      if (!pill) return;
      const tag = pill.dataset.tag;
      // Toggle: si ya está activo el mismo tag, lo desactiva
      activeTag = activeTag && activeTag.toLowerCase() === tag.toLowerCase() ? null : tag;
      renderTagPills();
      renderProducts();
    });
  }

  // Categorías (delegación)
  categoryContainer.addEventListener("click", (e) => {
    const btn = e.target.closest(".cat-btn");
    if (!btn) return;
    activeCategory = btn.dataset.cat;
    renderCategories();
    renderBrands(); // la lista de marcas depende de la categoría elegida
    renderProducts();
    scrollToCatalog();
  });

  // Marcas (delegación)
  brandsContainer.addEventListener("change", (e) => {
    const checkbox = e.target.closest("input[type='checkbox']");
    if (!checkbox) return;
    const brand = checkbox.dataset.brand;
    if (checkbox.checked) {
      activeBrands.add(brand);
    } else {
      activeBrands.delete(brand);
    }
    renderCategories(); // la lista de categorías depende de las marcas elegidas
    renderProducts();
    scrollToCatalog();
  });

  // Grilla de productos (delegación: agregar / sumar / restar / ver detalles)
  productGrid.addEventListener("click", (e) => {
    const detailsBtn = e.target.closest(".btn-details");
    if (detailsBtn) {
      openProductModal(detailsBtn.dataset.id);
      return;
    }
    const visualEl = e.target.closest(".card-img, .card-name");
    if (visualEl) {
      openProductModal(visualEl.dataset.id);
      return;
    }
    const addBtn = e.target.closest(".btn-add");
    if (addBtn) {
      handleAddToCart(addBtn.dataset.id);
      return;
    }
    const plusBtn = e.target.closest(".qty-plus");
    if (plusBtn) {
      handleChangeQty(plusBtn.dataset.id, 1, "grid");
      return;
    }
    const minusBtn = e.target.closest(".qty-minus");
    if (minusBtn) {
      handleChangeQty(minusBtn.dataset.id, -1, "grid");
      return;
    }
  });

  // Botón abrir carrito
  cartBtn.addEventListener("click", openCart);

  // Cerrar carrito
  cartCloseBtn.addEventListener("click", closeCart);
  cartOverlay.addEventListener("click", closeCart);

  // Modal de producto: cerrar
  modalCloseBtn.addEventListener("click", closeProductModal);
  modalOverlay.addEventListener("click", closeProductModal);

  // Lightbox de imagen: cerrar
  lightboxCloseBtn.addEventListener("click", closeLightbox);
  lightboxOverlay.addEventListener("click", (e) => {
    if (e.target === lightboxOverlay) closeLightbox();
  });

  // Modal de producto: variantes / agregar / sumar / restar / ampliar imagen / stepper (delegación)
  modalBody.addEventListener("click", (e) => {
    const imgEl = e.target.closest(".modal-img img");
    if (imgEl) {
      openLightbox(imgEl.src, imgEl.alt);
      return;
    }
    const variantBtn = e.target.closest(".variant-pill");
    if (variantBtn) {
      renderModalProduct(variantBtn.dataset.id);
      return;
    }
    // Selector "por unidad" / "por caja" (solo mayorista)
    const unitBtn = e.target.closest(".unit-pill");
    if (unitBtn) {
      const row = unitBtn.closest(".modal-unit-row");
      if (row) {
        row.dataset.selectedUnit = unitBtn.dataset.unit;
        row.querySelectorAll(".unit-pill").forEach((btn) => {
          btn.classList.toggle("active", btn === unitBtn);
        });
      }
      return;
    }
    // Stepper +/−
    const incBtn = e.target.closest(".modal-qty-inc");
    if (incBtn) {
      const valEl = modalBody.querySelector("#modalQtyVal");
      if (valEl) valEl.textContent = Math.min(99, parseInt(valEl.textContent) + 1);
      return;
    }
    const decBtn = e.target.closest(".modal-qty-dec");
    if (decBtn) {
      const valEl = modalBody.querySelector("#modalQtyVal");
      if (valEl) valEl.textContent = Math.max(1, parseInt(valEl.textContent) - 1);
      return;
    }
    // Agregar al pedido con la cantidad del stepper
    const addBtn = e.target.closest(".btn-add");
    if (addBtn) {
      const valEl = modalBody.querySelector("#modalQtyVal");
      const qty = valEl ? Math.max(1, parseInt(valEl.textContent) || 1) : 1;
      const unitRow = modalBody.querySelector(".modal-unit-row");
      const unitType = unitRow
        ? (unitRow.dataset.selectedUnit || "unidad")
        : (addBtn.dataset.unitType || "unidad");
      handleAddToCart(addBtn.dataset.id, qty, unitType);
      return;
    }
  });

  // Carrito: cantidades y eliminar (delegación)
  cartBody.addEventListener("click", (e) => {
    const plusBtn = e.target.closest(".cart-qty-plus");
    if (plusBtn) {
      handleChangeQty(plusBtn.dataset.id, 1, "cart");
      return;
    }
    const minusBtn = e.target.closest(".cart-qty-minus");
    if (minusBtn) {
      handleChangeQty(minusBtn.dataset.id, -1, "cart");
      return;
    }
    const removeBtn = e.target.closest(".cart-item-remove");
    if (removeBtn) {
      handleRemove(removeBtn.dataset.id);
      return;
    }
  });

  // Vaciar carrito → dialog custom
  cartClearBtn.addEventListener("click", () => {
    if (getTotalLines() === 0) return;
    clearCartDialogOverlay.classList.add("open");
  });
  clearCartCancel.addEventListener("click", () => {
    clearCartDialogOverlay.classList.remove("open");
  });
  clearCartDialogOverlay.addEventListener("click", (e) => {
    if (e.target === clearCartDialogOverlay) clearCartDialogOverlay.classList.remove("open");
  });
  clearCartConfirm.addEventListener("click", () => {
    clearCartDialogOverlay.classList.remove("open");
    clearCart();
    updateCartBadge();
    renderCart();
    renderProducts();
  });

  // Enviar por WhatsApp
  cartWhatsappBtn.addEventListener("click", sendOrderToWhatsApp);

  // Formulario de contacto
  contactSubmit.addEventListener("click", handleContactSubmit);
  contactMessage.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.ctrlKey) handleContactSubmit();
  });

  // Cerrar carrito / modal / lightbox / dialog con tecla Escape
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (isOrderModalOpen()) {
        closeOrderModal();
        return;
      }
      if (buyerModalOverlay && buyerModalOverlay.classList.contains("open")) {
        closeBuyerTypeModal();
        return;
      }
      if (isContactModalOpen()) {
        closeContactModal();
        return;
      }
      if (clearCartDialogOverlay.classList.contains("open")) {
        clearCartDialogOverlay.classList.remove("open");
        return;
      }
      if (lightboxOverlay.classList.contains("open")) {
        closeLightbox();
        return;
      }
      if (isFilterSheetOpen()) {
        closeFilterSheet();
        return;
      }
      closeCart();
      closeProductModal();
    }
  });
}

// ──────────────────────────────────────────────────────────
// BRANDS MARQUEE: click para filtrar por marca
// ──────────────────────────────────────────────────────────

function setupBrandCarouselClicks() {
  const marqueeWrapper = document.querySelector(".brands-marquee-wrapper");
  if (!marqueeWrapper) return;

  // Detectar si fue un drag/scroll en lugar de un click real
  let pointerStartX = 0;
  let isDragging = false;

  marqueeWrapper.addEventListener("pointerdown", (e) => {
    pointerStartX = e.clientX;
    isDragging = false;
  }, { passive: true });

  marqueeWrapper.addEventListener("pointermove", (e) => {
    if (Math.abs(e.clientX - pointerStartX) > 6) {
      isDragging = true;
    }
  }, { passive: true });

  marqueeWrapper.addEventListener("click", (e) => {
    if (isDragging) return; // ignorar si fue un swipe

    const card = e.target.closest(".brand-logo-card[data-brand]");
    if (!card) return;

    const brandName = card.dataset.brand;
    if (!brandName) return;

    // Activar filtro por esta marca (toggle: si ya está activa, la quita)
    const isSameActive = activeBrands.size === 1 && activeBrands.has(brandName);

    activeBrands.clear();
    if (!isSameActive) {
      activeBrands.add(brandName);
    }

    // Limpiar otros filtros para mostrar solo esa marca
    activeCategory = "Todos";
    activeTag = null;
    searchTerm = "";
    const searchEl = document.getElementById("searchInput");
    if (searchEl) searchEl.value = "";
    updateSearchClearBtn();

    // Actualizar UI de filtros
    renderCategories();
    renderBrands();
    renderTagPills();
    renderProducts();
    updateFilterSelectLabels();

    // Scroll suave al catálogo
    scrollToCatalog();

    // Toast de feedback
    if (!isSameActive) {
      showToast(`Mostrando productos de ${brandName}`, "ok");
    }
  });

  // Soporte teclado (Enter/Space en cards con tabindex)
  marqueeWrapper.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const card = e.target.closest(".brand-logo-card[data-brand]");
    if (!card) return;
    e.preventDefault();
    card.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

// ──────────────────────────────────────────────────────────
// INIT
// ──────────────────────────────────────────────────────────

function init() {
  buyerType = getSavedBuyerType();
  updateBuyerTypeUI();
  updateCartBadge();
  fillBuyerFormFromStorage();
  setupBuyerFormListeners();
  setupFilterSheetListeners();
  setupEventListeners();
  setupBuyerTypeListeners();
  setupBuyerChangeConfirmListeners();
  setupContactModalListeners();
  setupOrderModalListeners();
  setupQrModalListeners();
  setupWaWebBtnListener();
  setupFloatingWaBtn();
  setupBrandCarouselClicks();
  renderCategorySkeletons();
  renderBrandSkeletons();
  renderProductSkeletons();
  initFirestoreListeners();

  // Si todavía no eligió mayorista/minorista, se le pide apenas entra al sitio.
  if (!buyerType) {
    setTimeout(openBuyerTypeModal, 450);
  }
}

init();
