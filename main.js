import { db } from "./firebase-config.js";
import {
  collection,
  onSnapshot,
  addDoc,
  serverTimestamp,
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
// Formato internacional, solo números (sin "+", espacios ni guiones).
// Argentina: 54 9 + código de área (3735) + número (627215)
const WHATSAPP_NUMBER = "5493735627215";

// Clave de localStorage donde se guarda si el cliente compra
// por mayor o por menor.
const BUYER_TYPE_KEY = "marchese_buyer_type";
const BUYER_TYPE_LABELS = { mayorista: "Mayorista", minorista: "Minorista" };
const BUYER_TYPE_WA_LABELS = {
  mayorista: "📦 PEDIDO MAYORISTA",
  minorista: "🛍️ PEDIDO MINORISTA",
};

// ──────────────────────────────────────────────────────────
// REFERENCIAS AL DOM
// ──────────────────────────────────────────────────────────

const productGrid = document.getElementById("productGrid");
const categoryContainer = document.getElementById("categoryContainer");
const brandsContainer = document.getElementById("brandsContainer");
const searchInput = document.getElementById("searchInput");

const filterCatSelectBtn = document.getElementById("filterCatSelectBtn");
const filterCatSelectValue = document.getElementById("filterCatSelectValue");
const filterBrandSelectBtn = document.getElementById("filterBrandSelectBtn");
const filterBrandSelectValue = document.getElementById("filterBrandSelectValue");

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

let activeCategory = "Todos";
let activeBrands = new Set();
let searchTerm = "";
let activeTag = null; // null = sin filtro de tag

// Tipo de compra elegido por el cliente: "mayorista" | "minorista" | null
let buyerType = null;

// Tipo de hoja de filtros mobile abierta actualmente: "cat" | "brand" | null
let filterSheetType = null;

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
        .sort(sortByOrderThenName);
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
        .sort(sortByOrderThenName);
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
// RENDER: CATEGORÍAS
// ──────────────────────────────────────────────────────────

function getCategoryList() {
  if (allCategories.length > 0) {
    return allCategories.map((c) => c.name).filter(Boolean);
  }
  // Si no hay colección "categories" todavía, las derivamos de los productos ACTIVOS
  const set = new Set();
  allProducts.filter((p) => p.active !== false).forEach((p) => p.category && set.add(p.category));
  return Array.from(set).sort((a, b) => a.localeCompare(b, "es"));
}

const CAT_VISIBLE_LIMIT = 6;
const BRAND_VISIBLE_LIMIT = 6;
let catExpanded = false;
let brandExpanded = false;

function renderCategories() {
  const categories = getCategoryList();

  // Solo contar productos activos (los agotados siguen en allProducts pero no se cuentan)
  const activeProducts = allProducts.filter((p) => p.active !== false);
  const countFor = (catName) =>
    catName === "Todos"
      ? activeProducts.length
      : activeProducts.filter((p) => p.category === catName).length;

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
          <span class="cat-count">${countFor(c.name)}</span>
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
    renderProducts();
  }
}

// ──────────────────────────────────────────────────────────
// RENDER: MARCAS
// ──────────────────────────────────────────────────────────

function getBrandList() {
  if (allBrands.length > 0) {
    return allBrands.map((b) => b.name).filter(Boolean);
  }
  const set = new Set();
  allProducts.forEach((p) => p.brand && set.add(p.brand));
  return Array.from(set).sort((a, b) => a.localeCompare(b, "es"));
}

function renderBrands() {
  const brands = getBrandList();

  // ── Sidebar desktop ──────────────────────────────────────
  if (brands.length === 0) {
    brandsContainer.innerHTML = `<p style="font-size:0.8rem;color:var(--muted)">Sin marcas cargadas</p>`;
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
  if (!filterCatSelectBtn) return;

  filterCatSelectValue.textContent = activeCategory;
  filterCatSelectBtn.classList.toggle("has-active", activeCategory !== "Todos");

  const brandCount = activeBrands.size;
  filterBrandSelectValue.textContent =
    brandCount === 0
      ? "Todas"
      : brandCount === 1
      ? Array.from(activeBrands)[0]
      : `${brandCount} marcas`;
  filterBrandSelectBtn.classList.toggle("has-active", brandCount > 0);
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
    const activeProds = allProducts.filter((p) => p.active !== false);
    const countFor = (catName) =>
      catName === "Todos"
        ? activeProds.length
        : activeProds.filter((p) => p.category === catName).length;

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
                <span class="filter-option-count">${countFor(c.name)}</span>
              </button>`;
          })
          .join("")
      : `<div class="filter-sheet-empty">No encontramos categorías para "${escapeHtml(search)}"</div>`;
  } else if (filterSheetType === "brand") {
    const brands = getBrandList();
    const countFor = (name) => allProducts.filter((p) => p.active !== false && p.brand === name).length;
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
            <span class="filter-option-count">${countFor(name)}</span>
          </button>`;
      })
      .join("");

    filterSheetBody.innerHTML =
      allOption || brandOptions
        ? allOption + brandOptions
        : `<div class="filter-sheet-empty">No encontramos marcas para "${escapeHtml(search)}"</div>`;
  }
}

function openFilterSheet(type) {
  filterSheetType = type;
  filterSheetTitle.textContent = type === "cat" ? "Categoría" : "Marca";
  filterSheetSearch.value = "";
  filterSheetSearch.placeholder = type === "cat" ? "Buscar categoría…" : "Buscar marca…";

  renderFilterSheetBody();
  updateFilterSheetApplyLabel();

  filterSheetOverlay.classList.add("open");
  filterSheet.classList.add("open");
  filterCatSelectBtn.classList.toggle("open", type === "cat");
  filterCatSelectBtn.setAttribute("aria-expanded", type === "cat" ? "true" : "false");
  filterBrandSelectBtn.classList.toggle("open", type === "brand");
  filterBrandSelectBtn.setAttribute("aria-expanded", type === "brand" ? "true" : "false");
  lockBodyScroll();
}

function closeFilterSheet() {
  if (!filterSheet.classList.contains("open")) return;
  filterSheetOverlay.classList.remove("open");
  filterSheet.classList.remove("open");
  filterCatSelectBtn.classList.remove("open");
  filterCatSelectBtn.setAttribute("aria-expanded", "false");
  filterBrandSelectBtn.classList.remove("open");
  filterBrandSelectBtn.setAttribute("aria-expanded", "false");
  unlockBodyScroll();
}

function isFilterSheetOpen() {
  return filterSheet.classList.contains("open");
}

function setupFilterSheetListeners() {
  if (!filterCatSelectBtn) return; // no estamos en una página con filtros mobile

  filterCatSelectBtn.addEventListener("click", () => {
    if (filterSheetType === "cat" && isFilterSheetOpen()) {
      closeFilterSheet();
      return;
    }
    openFilterSheet("cat");
  });

  filterBrandSelectBtn.addEventListener("click", () => {
    if (filterSheetType === "brand" && isFilterSheetOpen()) {
      closeFilterSheet();
      return;
    }
    openFilterSheet("brand");
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
    } else if (filterSheetType === "brand") {
      activeBrands.clear();
      renderBrands();
    }
    renderProducts();
    renderFilterSheetBody(filterSheetSearch.value);
    updateFilterSheetApplyLabel();
  });

  filterSheetApplyBtn.addEventListener("click", closeFilterSheet);
}

// ──────────────────────────────────────────────────────────
// FILTRADO Y RENDER DE PRODUCTOS
// ──────────────────────────────────────────────────────────

function getFilteredProducts() {
  return allProducts.filter((p) => {
    if (activeCategory !== "Todos" && p.category !== activeCategory) return false;
    if (activeBrands.size > 0 && !activeBrands.has(p.brand)) return false;
    if (activeTag && (p.tag || "").trim().toLowerCase() !== activeTag.toLowerCase()) return false;
    if (searchTerm) {
      const haystack = `${p.name || ""} ${p.description || ""}`.toLowerCase();
      if (!haystack.includes(searchTerm)) return false;
    }
    return true;
  });
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

  // Recolectar tags únicos de productos activos
  const tagsSet = new Set();
  allProducts
    .filter((p) => p.active !== false && p.tag && p.tag.trim())
    .forEach((p) => tagsSet.add(p.tag.trim()));

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

  // Badge "Agotado" tiene prioridad; si hay tag y está disponible, se muestra ese
  const tag = isOutOfStock
    ? `<span class="card-tag card-tag-soldout">Agotado</span>`
    : product.tag
    ? `<span class="card-tag">${escapeHtml(product.tag)}</span>`
    : "";

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
    : `<button type="button" class="btn-cart btn-details" data-id="${product.id}">Ver detalles</button>`;

  return `
    <div class="product-card${isOutOfStock ? " product-card-soldout" : ""}" data-id="${product.id}">
      <div class="card-img ${bg}"${imgDataAttr}>
        ${tag}
        ${inner}
      </div>
      <div class="card-body">
        <p class="card-cat">${escapeHtml(product.category || "")}</p>
        <h3 class="card-name"${nameDataAttr}>${escapeHtml(product.name || "")}</h3>
        <p class="card-desc">${escapeHtml(product.description || "")}</p>
        ${actionBtn}
      </div>
    </div>`;
}

function renderProducts() {
  if (!productsLoaded) {
    productGrid.innerHTML = `
      <div class="state-msg">
        <div class="spinner"></div>
        <span>Cargando catálogo…</span>
      </div>`;
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

  productGrid.innerHTML = filtered.map(productCardHtml).join("");
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
  const tag = product.tag
    ? `<span class="card-tag">${escapeHtml(product.tag)}</span>`
    : "";
  const variants = getVariantGroup(product);

  // Siempre: stepper de cantidad + botón agregar
  const cartActionHtml = `
    <div class="modal-qty-row">
      <span class="modal-qty-label">Cantidad</span>
      <div class="modal-qty-stepper">
        <button type="button" class="modal-qty-btn modal-qty-dec" aria-label="Restar">−</button>
        <span class="modal-qty-val" id="modalQtyVal">1</span>
        <button type="button" class="modal-qty-btn modal-qty-inc" aria-label="Sumar">+</button>
      </div>
      <button type="button" class="btn-cart-qty btn-add" data-id="${product.id}">
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
  const liveProduct = allProducts.find((p) => p.id === item.id);
  const isSoldOut = !liveProduct || liveProduct.active === false;

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
        <div class="cart-item-cat">${escapeHtml(item.category || "")}</div>
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

function handleAddToCart(productId, qty = 1) {
  const product = allProducts.find((p) => p.id === productId);
  if (!product) return;
  // Bloquear si el producto está agotado (inactivo)
  if (product.active === false) return;
  addToCart(product, qty);
  updateCartBadge();
  // Resetear stepper del modal a 1 sin re-renderizar todo el contenido
  const valEl = modalBody.querySelector("#modalQtyVal");
  if (valEl) valEl.textContent = "1";
  const label = qty > 1 ? `${qty} unidades agregadas al pedido ✓` : "Agregado al pedido ✓";
  showToast(product.name, "ok", label);
}

function handleChangeQty(productId, delta, rerenderTarget) {
  changeQty(productId, delta);
  updateCartBadge();
  if (rerenderTarget === "cart") renderCart();
  if (rerenderTarget === "grid") renderProducts();
  if (isModalOpen()) renderModalProduct(productId);
}

function handleRemove(productId) {
  removeFromCart(productId);
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
  let img = frame.querySelector("img.qr-img");
  if (!img) {
    img = document.createElement("img");
    img.className = "qr-img";
    img.width = size;
    img.height = size;
    img.style.borderRadius = "8px";
    img.style.display = "block";
    // Insertar antes del primer qr-corner
    frame.insertBefore(img, frame.querySelector(".qr-corner"));
  }
  img.src = qrUrl;
  img.alt = "QR código de WhatsApp";
}

const qrModalOverlay = document.getElementById("qrModalOverlay");
const qrModalClose   = document.getElementById("qrModalClose");
const qrWaWebBtn     = document.getElementById("qrWaWebBtn");

function openQrModal(waUrl) {
  renderQRCode(waUrl);
  if (qrWaWebBtn) qrWaWebBtn.href = waUrl;
  if (qrModalOverlay) qrModalOverlay.classList.add("open");
  lockBodyScroll();
}

function closeQrModal() {
  if (!qrModalOverlay || !qrModalOverlay.classList.contains("open")) return;
  qrModalOverlay.classList.remove("open");
  unlockBodyScroll();
}

function setupQrModalListeners() {
  if (!qrModalOverlay) return;
  if (qrModalClose)   qrModalClose.addEventListener("click", closeQrModal);
  qrModalOverlay.addEventListener("click", (e) => {
    if (e.target === qrModalOverlay) closeQrModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && qrModalOverlay.classList.contains("open")) {
      closeQrModal();
    }
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
    buyerOptionMayorista.addEventListener("click", () => selectBuyerType("mayorista"));
  }
  if (buyerOptionMinorista) {
    buyerOptionMinorista.addEventListener("click", () => selectBuyerType("minorista"));
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
// WHATSAPP
// ──────────────────────────────────────────────────────────

function buildWhatsAppMessage() {
  const cart = getCart();
  const items = Object.values(cart);

  let message = "";
  if (buyerType && BUYER_TYPE_WA_LABELS[buyerType]) {
    message += `*${BUYER_TYPE_WA_LABELS[buyerType]}*\n\n`;
  }
  message += "¡Hola! 👋 Quiero hacer el siguiente pedido:\n\n";
  items.forEach((item) => {
    message += `▪ ${item.qty}x ${item.name}`;
    if (item.category) message += ` (${item.category})`;
    message += "\n";
  });
  message += `\nTotal de unidades: ${getTotalUnits(cart)}`;
  message += "\n\n¡Gracias!";
  return message;
}

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

  // Filtrar productos que fueron desactivados (agotados) desde que se agregaron
  const soldOutItems = Object.values(cart).filter((item) => {
    const live = allProducts.find((p) => p.id === item.id);
    return !live || live.active === false;
  });

  if (soldOutItems.length > 0) {
    // Quitar los agotados del carrito automáticamente
    soldOutItems.forEach((item) => removeFromCart(item.id));
    updateCartBadge();
    renderCart();
    renderProducts();

    // Si quedó el carrito vacío luego de sacar los agotados, avisar y no enviar
    const remaining = getCart();
    if (Object.keys(remaining).length === 0) {
      showToast("Sin productos disponibles", "error", "Todos los productos de tu pedido se agotaron");
      return;
    }

    // Había algo agotado pero quedan ítems: avisar y continuar
    const names = soldOutItems.map((i) => i.name).join(", ");
    showToast("Productos agotados quitados", "error", `Se eliminaron del pedido: ${names}`);
    // Dar un momento para que el usuario vea el aviso antes de abrir WA
    setTimeout(() => _doSendWhatsApp(), 1200);
    return;
  }

  _doSendWhatsApp();
}

function _doSendWhatsApp() {
  const message = buildWhatsAppMessage();
  const waUrl = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
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
  searchInput.addEventListener(
    "input",
    debounce((e) => {
      searchTerm = e.target.value.trim().toLowerCase();
      renderProducts();
    }, 200)
  );

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
    renderProducts();
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
    renderProducts();
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
      handleAddToCart(addBtn.dataset.id, qty);
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
      if (buyerModalOverlay && buyerModalOverlay.classList.contains("open")) {
        closeBuyerTypeModal();
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
// INIT
// ──────────────────────────────────────────────────────────

function init() {
  buyerType = getSavedBuyerType();
  updateBuyerTypeUI();
  updateCartBadge();
  setupFilterSheetListeners();
  setupEventListeners();
  setupBuyerTypeListeners();
  setupQrModalListeners();
  setupWaWebBtnListener();
  initFirestoreListeners();

  // Si todavía no eligió mayorista/minorista, se le pide apenas entra al sitio.
  if (!buyerType) {
    setTimeout(openBuyerTypeModal, 450);
  }
}

init();
