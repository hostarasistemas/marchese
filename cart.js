// ──────────────────────────────────────────────────────────
// Carrito de compras - Marchese Golosinas
// Se persiste en localStorage para que el pedido no se pierda
// si el usuario recarga la página.
//
// Cada producto puede agregarse "por unidad" o "por caja"
// (esto último solo disponible para el modo Mayorista). Para
// que ambas formas de compra convivan como líneas separadas
// del mismo producto, la clave interna del carrito es:
//   - el id del producto tal cual, si es "unidad" (compatible
//     con carritos guardados antes de esta funcionalidad)
//   - "${productId}::caja", si es "por caja"
// ──────────────────────────────────────────────────────────

const STORAGE_KEY = "marchese_cart";

/** Arma la clave interna del carrito según el tipo de unidad. */
function buildCartKey(productId, unitType) {
  return unitType === "caja" ? `${productId}::caja` : productId;
}

/**
 * Devuelve el carrito actual como objeto:
 * { [cartKey]: { id, productId, name, category, image, tag, unitType, qty } }
 */
export function getCart() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (err) {
    console.error("Error leyendo el carrito:", err);
    return {};
  }
}

function saveCart(cart) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
  } catch (err) {
    console.error("Error guardando el carrito:", err);
  }
}

/**
 * Suma 1 (o la cantidad indicada) al producto. Lo agrega si no existía.
 * `unitType` es "unidad" (por defecto) o "caja". Una misma variante de
 * producto en "unidad" y en "caja" queda como dos líneas distintas.
 */
export function addToCart(product, qty = 1, unitType = "unidad") {
  const cart = getCart();
  const key = buildCartKey(product.id, unitType);
  if (cart[key]) {
    cart[key].qty += qty;
  } else {
    cart[key] = {
      id: key,
      productId: product.id,
      name: product.name,
      category: product.category || "",
      image: product.image || "",
      tag: product.tag || "",
      unitType,
      qty,
    };
  }
  saveCart(cart);
  return cart;
}

/** Cambia la cantidad de una línea del carrito. Si llega a 0, la elimina. */
export function setQty(cartKey, qty) {
  const cart = getCart();
  if (!cart[cartKey]) return cart;
  if (qty <= 0) {
    delete cart[cartKey];
  } else {
    cart[cartKey].qty = qty;
  }
  saveCart(cart);
  return cart;
}

/** Suma/resta 1 a la cantidad de una línea del carrito. */
export function changeQty(cartKey, delta) {
  const cart = getCart();
  if (!cart[cartKey]) return cart;
  return setQty(cartKey, cart[cartKey].qty + delta);
}

/** Elimina una línea del carrito. */
export function removeFromCart(cartKey) {
  const cart = getCart();
  delete cart[cartKey];
  saveCart(cart);
  return cart;
}

/** Vacía todo el carrito. */
export function clearCart() {
  saveCart({});
  return {};
}

/** Cantidad de líneas (producto + tipo de unidad) distintas en el carrito. */
export function getTotalLines(cart = getCart()) {
  return Object.keys(cart).length;
}

/** Suma total de unidades (cantidades) en el carrito. */
export function getTotalUnits(cart = getCart()) {
  return Object.values(cart).reduce((sum, item) => sum + item.qty, 0);
}

/** Devuelve la cantidad actual de una línea puntual (0 si no está). */
export function getQty(cartKey, cart = getCart()) {
  return cart[cartKey]?.qty || 0;
}
