import { z } from "zod";
import {
  createGatewayOpenSessionRequestSchema,
  createGatewayOpenSessionResponseSchema,
  gatewayObservabilityEventSchema,
  gatewayPairingExchangeRequestSchema,
  gatewayPairingExchangeResponseSchema,
  type GatewayObservabilityEvent,
  type GatewayOpenSessionRequest,
  type GatewayOpenSessionResponse,
  type GatewayPairingExchangeRequest,
  type GatewayPairingExchangeResponse
} from "@/lib/decision-gateway/types";

type GatewayFetch = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>;

type GatewayClientError =
  | "not_configured"
  | "invalid_config"
  | "invalid_request"
  | "request_failed"
  | "http_error"
  | "invalid_response";

interface GatewayClientPaths {
  pairingExchange: string;
  openSession: string;
  observability: string;
}

export interface DecisionGatewayClientConfig {
  baseUrl?: string;
  apiToken?: string;
  fetchImpl?: GatewayFetch;
  timeoutMs?: number;
  paths?: Partial<GatewayClientPaths>;
  env?: NodeJS.ProcessEnv;
}

export interface GatewayClientErrorMetadata {
  code: GatewayClientError;
  status?: number;
  statusText?: string;
  name?: string;
  message?: string;
  issues?: Array<{
    path: string;
    message: string;
  }>;
}

export type GatewayClientResult<T> =
  | {
      ok: true;
      data: T;
    }
  | {
      ok: false;
      error: GatewayClientError;
      metadata: GatewayClientErrorMetadata;
    };

export const defaultDecisionGatewayClientPaths: GatewayClientPaths = {
  pairingExchange: "/api/mobile/pairing/exchange",
  openSession: "/api/mobile/web-sessions",
  observability: "/api/mobile/observability"
};

const defaultTimeoutMs = 10_000;

class GatewayRequestTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Decision gateway request timed out after ${timeoutMs}ms`);
    this.name = "AbortError";
  }
}

export async function exchangePairingToken(
  request: GatewayPairingExchangeRequest,
  config?: DecisionGatewayClientConfig
): Promise<GatewayClientResult<GatewayPairingExchangeResponse>> {
  const parsed = gatewayPairingExchangeRequestSchema.safeParse(request);
  if (!parsed.success) {
    return invalidValidationResult("invalid_request", parsed.error);
  }

  return postGatewayJson(
    "pairingExchange",
    parsed.data,
    gatewayPairingExchangeResponseSchema,
    config
  );
}

export async function createWebSessionTicket(
  request: GatewayOpenSessionRequest,
  config?: DecisionGatewayClientConfig
): Promise<GatewayClientResult<GatewayOpenSessionResponse>> {
  const resolvedConfig = resolveClientConfig(config);
  if (!resolvedConfig.ok) {
    return resolvedConfig;
  }

  const parsed = createGatewayOpenSessionRequestSchema({
    gatewayOrigin: resolvedConfig.data.baseUrl
  }).safeParse(request);
  if (!parsed.success) {
    return invalidValidationResult("invalid_request", parsed.error);
  }

  return postGatewayJson(
    "openSession",
    parsed.data,
    createGatewayOpenSessionResponseSchema({
      gatewayOrigin: resolvedConfig.data.baseUrl
    }),
    config,
    {
      resolvedConfig: resolvedConfig.data
    }
  );
}

export async function postObservabilityEvent(
  event: GatewayObservabilityEvent,
  config?: DecisionGatewayClientConfig
): Promise<GatewayClientResult<{ status: number }>> {
  const parsed = gatewayObservabilityEventSchema.safeParse(event);
  if (!parsed.success) {
    return invalidValidationResult("invalid_request", parsed.error);
  }

  return postGatewayJson(
    "observability",
    parsed.data,
    z.object({ status: z.number().int() }),
    config,
    { acceptEmptyBody: true }
  );
}

async function postGatewayJson<T>(
  pathName: keyof GatewayClientPaths,
  body: unknown,
  responseSchema: z.ZodType<T>,
  config?: DecisionGatewayClientConfig,
  options: {
    acceptEmptyBody?: boolean;
    resolvedConfig?: ResolvedDecisionGatewayClientConfig;
  } = {}
): Promise<GatewayClientResult<T>> {
  const resolvedConfigResult = options.resolvedConfig
    ? ({ ok: true, data: options.resolvedConfig } as const)
    : resolveClientConfig(config);
  if (!resolvedConfigResult.ok) {
    return resolvedConfigResult;
  }
  const resolvedConfig = resolvedConfigResult.data;

  const sensitiveValues = [
    resolvedConfig.apiToken,
    ...collectStringValues(body)
  ].filter((value): value is string => Boolean(value));
  const controller = new AbortController();
  const timeoutMs = resolvedConfig.timeoutMs;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<Response>((_, reject) => {
    timeout = setTimeout(() => {
      const error = new GatewayRequestTimeoutError(timeoutMs);
      controller.abort(error);
      reject(error);
    }, timeoutMs);
  });

  try {
    const response = await Promise.race([
      resolvedConfig.fetchImpl(
        buildGatewayUrl(resolvedConfig.baseUrl, resolvedConfig.paths[pathName]),
        {
          method: "POST",
          headers: buildHeaders(resolvedConfig.apiToken),
          body: JSON.stringify(body),
          signal: controller.signal
        }
      ),
      timeoutPromise
    ]);

    if (!response.ok) {
      return {
        ok: false,
        error: "http_error",
        metadata: {
          code: "http_error",
          status: response.status,
          statusText: response.statusText
        }
      };
    }

    const json = await readJsonResponse(response, options.acceptEmptyBody);
    if (!json.ok) {
      return json;
    }

    const parsed = responseSchema.safeParse(json.data);
    if (!parsed.success) {
      return invalidValidationResult("invalid_response", parsed.error);
    }

    return {
      ok: true,
      data: parsed.data
    };
  } catch (error) {
    return {
      ok: false,
      error: "request_failed",
      metadata: {
        code: "request_failed",
        ...toSafeErrorMetadata(error, sensitiveValues)
      }
    };
  } finally {
    clearTimeout(timeout);
  }
}

function resolveClientConfig(
  config: DecisionGatewayClientConfig = {}
): GatewayClientResult<ResolvedDecisionGatewayClientConfig> {
  const env = config.env ?? process.env;
  const rawBaseUrl = config.baseUrl ?? env.DECISION_GATEWAY_BASE_URL;

  if (!rawBaseUrl) {
    return {
      ok: false,
      error: "not_configured",
      metadata: {
        code: "not_configured",
        message: "DECISION_GATEWAY_BASE_URL is not configured"
      }
    };
  }

  const baseUrl = parseHttpUrl(rawBaseUrl);
  if (!baseUrl) {
    return {
      ok: false,
      error: "invalid_config",
      metadata: {
        code: "invalid_config",
        message: "DECISION_GATEWAY_BASE_URL must be a valid http(s) URL"
      }
    };
  }

  return {
    ok: true,
    data: {
      baseUrl,
      apiToken: config.apiToken ?? env.DECISION_GATEWAY_API_TOKEN,
      fetchImpl: config.fetchImpl ?? fetch,
      timeoutMs: config.timeoutMs ?? defaultTimeoutMs,
      paths: {
        ...defaultDecisionGatewayClientPaths,
        ...config.paths
      }
    }
  };
}

interface ResolvedDecisionGatewayClientConfig {
  baseUrl: URL;
  apiToken?: string;
  fetchImpl: GatewayFetch;
  timeoutMs: number;
  paths: GatewayClientPaths;
}

function buildGatewayUrl(baseUrl: URL, path: string) {
  const base = baseUrl.toString().replace(/\/$/, "");
  const normalizedPath = path.replace(/^\//, "");
  return `${base}/${normalizedPath}`;
}

function buildHeaders(apiToken: string | undefined): HeadersInit {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json"
  };

  if (apiToken) {
    headers.Authorization = `Bearer ${apiToken}`;
  }

  return headers;
}

async function readJsonResponse(
  response: Response,
  acceptEmptyBody = false
): Promise<GatewayClientResult<unknown>> {
  const text = await response.text();
  if (!text.trim()) {
    if (acceptEmptyBody) {
      return {
        ok: true,
        data: {
          status: response.status
        }
      };
    }

    return {
      ok: false,
      error: "invalid_response",
      metadata: {
        code: "invalid_response",
        message: "Decision gateway returned an empty response"
      }
    };
  }

  try {
    return {
      ok: true,
      data: JSON.parse(text) as unknown
    };
  } catch {
    return {
      ok: false,
      error: "invalid_response",
      metadata: {
        code: "invalid_response",
        message: "Decision gateway returned invalid JSON"
      }
    };
  }
}

function invalidValidationResult<T>(
  error: Extract<GatewayClientError, "invalid_request" | "invalid_response">,
  validationError: z.ZodError
): GatewayClientResult<T> {
  return {
    ok: false,
    error,
    metadata: {
      code: error,
      issues: validationError.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message
      }))
    }
  };
}

function parseHttpUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }

    return url;
  } catch {
    return null;
  }
}

function toSafeErrorMetadata(
  error: unknown,
  sensitiveValues: string[]
): Pick<GatewayClientErrorMetadata, "name" | "message"> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: redactSensitiveText(error.message, sensitiveValues).slice(0, 500)
    };
  }

  return {
    message: "Unknown decision gateway client error"
  };
}

function redactSensitiveText(text: string, sensitiveValues: string[]) {
  return sensitiveValues.reduce((redacted, value) => {
    if (!value) {
      return redacted;
    }

    return redacted.split(value).join("[redacted]");
  }, text);
}

function collectStringValues(value: unknown): string[] {
  if (typeof value === "string") {
    return [value];
  }

  if (Array.isArray(value)) {
    return value.flatMap(collectStringValues);
  }

  if (!value || typeof value !== "object") {
    return [];
  }

  return Object.values(value).flatMap(collectStringValues);
}
