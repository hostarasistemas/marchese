// ──────────────────────────────────────────────────────────
// Carrito de compras - Marchese Golosinas
// Se persiste en localStorage para que el pedido no se pierda
// si el usuario recarga la página.
// ──────────────────────────────────────────────────────────

const STORAGE_KEY = "marchese_cart";

/**
 * Devuelve el carrito actual como objeto:
 * { [productId]: { id, name, category, image, tag, qty } }
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

/** Suma 1 (o la cantidad indicada) al producto. Lo agrega si no existía. */
export function addToCart(product, qty = 1) {
  const cart = getCart();
  if (cart[product.id]) {
    cart[product.id].qty += qty;
  } else {
    cart[product.id] = {
      id: product.id,
      name: product.name,
      category: product.category || "",
      image: product.image || "",
      tag: product.tag || "",
      qty,
    };
  }
  saveCart(cart);
  return cart;
}

/** Cambia la cantidad de un producto. Si llega a 0, lo elimina. */
export function setQty(productId, qty) {
  const cart = getCart();
  if (!cart[productId]) return cart;
  if (qty <= 0) {
    delete cart[productId];
  } else {
    cart[productId].qty = qty;
  }
  saveCart(cart);
  return cart;
}

/** Suma/resta 1 a la cantidad de un producto. */
export function changeQty(productId, delta) {
  const cart = getCart();
  if (!cart[productId]) return cart;
  return setQty(productId, cart[productId].qty + delta);
}

/** Elimina un producto del carrito. */
export function removeFromCart(productId) {
  const cart = getCart();
  delete cart[productId];
  saveCart(cart);
  return cart;
}

/** Vacía todo el carrito. */
export function clearCart() {
  saveCart({});
  return {};
}

/** Cantidad de productos distintos en el carrito. */
export function getTotalLines(cart = getCart()) {
  return Object.keys(cart).length;
}

/** Suma total de unidades (cantidades) en el carrito. */
export function getTotalUnits(cart = getCart()) {
  return Object.values(cart).reduce((sum, item) => sum + item.qty, 0);
}

/** Devuelve la cantidad actual de un producto puntual (0 si no está). */
export function getQty(productId, cart = getCart()) {
  return cart[productId]?.qty || 0;
}