export const READINESS_GATE = Symbol('READINESS_GATE');

export interface ReadinessGate {
  isReady(): boolean | Promise<boolean>;
}
