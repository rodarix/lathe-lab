/** Micro bus d'événements (pas de dépendance). */
export class Emitter {
  constructor() {
    this._handlers = {};
  }
  on(event, fn) {
    (this._handlers[event] ??= []).push(fn);
    return () => this.off(event, fn);
  }
  off(event, fn) {
    this._handlers[event] = (this._handlers[event] || []).filter((f) => f !== fn);
  }
  emit(event, data) {
    for (const fn of this._handlers[event] || []) fn(data);
  }
}
