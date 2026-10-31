export function createEventLog() {
  const events = [];

  return {
    append(type, payload) {
      if (typeof type !== "string" || type.trim() === "") {
        throw new Error("type 不能为空");
      }
      const event = {
        seq: events.length + 1,
        type,
        payload,
        at: new Date().toISOString(),
      };
      events.push(event);
      return { ...event };
    },
    all() {
      return events.map((event) => ({ ...event }));
    },
    byType(type) {
      return events.filter((event) => event.type === type).map((event) => ({ ...event }));
    },
    size() {
      return events.length;
    },
  };
}
