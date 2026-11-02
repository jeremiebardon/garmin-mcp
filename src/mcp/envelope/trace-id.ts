export const TRACE_ID_PROVIDER = Symbol('TRACE_ID_PROVIDER');

export interface TraceIdProvider {
  getTraceId(): string;
}

// The 32-hex invalid OpenTelemetry trace id, until the tracing ticket replaces the provider.
export const PLACEHOLDER_TRACE_ID = '00000000000000000000000000000000';
