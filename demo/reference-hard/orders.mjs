export function createOrders(eventLog, inventory) {
  const orders = [];
  const byIdempotencyKey = new Map();

  const assertQuantity = (qty) => {
    if (!Number.isInteger(qty) || qty <= 0) {
      throw new Error("quantity 必须是正整数");
    }
  };

  return {
    placeOrder({ sku, qty, key }) {
      assertQuantity(qty);

      if (key !== undefined && byIdempotencyKey.has(key)) {
        return { ...byIdempotencyKey.get(key) };
      }

      // 先扣库存：不足时抛出，此时尚未创建订单，库存保持原状（原子性）
      inventory.reserve(sku, qty);

      const order = { id: orders.length + 1, sku, qty, status: "placed", key };
      orders.push(order);
      if (key !== undefined) byIdempotencyKey.set(key, order);

      eventLog.append("order_placed", { id: order.id, sku, qty, key });
      return { ...order };
    },
    cancelOrder(orderId) {
      const order = orders.find((item) => item.id === orderId);
      if (!order) throw new Error("order 不存在");
      if (order.status === "cancelled") throw new Error("订单已 cancelled");

      order.status = "cancelled";
      inventory.release(order.sku, order.qty);
      eventLog.append("order_cancelled", { id: order.id });
      return { ...order };
    },
    getOrder(id) {
      const order = orders.find((item) => item.id === id);
      return order ? { ...order } : undefined;
    },
    listOrders() {
      return orders.map((order) => ({ ...order }));
    },
  };
}
