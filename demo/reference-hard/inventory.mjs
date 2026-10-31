export function createInventory(eventLog) {
  const stockBySku = new Map();

  const read = (sku) => stockBySku.get(sku) ?? 0;

  const assertQuantity = (qty) => {
    if (!Number.isInteger(qty) || qty <= 0) {
      throw new Error("quantity 必须是正整数");
    }
  };

  return {
    restock(sku, qty) {
      assertQuantity(qty);
      stockBySku.set(sku, read(sku) + qty);
      eventLog.append("restocked", { sku, qty });
      return read(sku);
    },
    reserve(sku, qty) {
      assertQuantity(qty);
      if (read(sku) < qty) {
        throw new Error(`stock 不足：${sku} 剩 ${read(sku)}`);
      }
      stockBySku.set(sku, read(sku) - qty);
      eventLog.append("reserved", { sku, qty });
      return read(sku);
    },
    release(sku, qty) {
      assertQuantity(qty);
      stockBySku.set(sku, read(sku) + qty);
      eventLog.append("released", { sku, qty });
      return read(sku);
    },
    stock(sku) {
      return read(sku);
    },
    levels() {
      return Object.fromEntries(stockBySku);
    },
  };
}
