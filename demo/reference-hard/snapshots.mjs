export function createSnapshots(eventLog) {
  return {
    capture() {
      return { seq: eventLog.size(), at: new Date().toISOString() };
    },
    since(seq) {
      return eventLog
        .all()
        .filter((event) => event.seq > seq)
        .map((event) => ({ ...event }));
    },
    rebuild(reducer, initial) {
      return eventLog.all().reduce((acc, event) => reducer(acc, event), initial);
    },
  };
}
