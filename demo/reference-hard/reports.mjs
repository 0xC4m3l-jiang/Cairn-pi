export function createReports(eventLog, inventory, orders) {
  return {
    summary() {
      const orderList = orders.listOrders();
      const stockLevels = inventory.levels();
      return {
        events: eventLog.size(),
        orders: orderList.length,
        placed: orderList.filter((order) => order.status === "placed").length,
        cancelled: orderList.filter((order) => order.status === "cancelled").length,
        skus: Object.keys(stockLevels).length,
        totalStock: Object.values(stockLevels).reduce((sum, qty) => sum + qty, 0),
      };
    },
    auditTrail() {
      return eventLog.all().map((event) => ({ seq: event.seq, type: event.type }));
    },
  };
}
