import { createHash, randomBytes } from "node:crypto";
import { getSql } from "@/lib/db";
import {
  resolveTargetSubscriber,
  type SubscriberRecord,
  type SubscriberRepository
} from "@/lib/subscribers";
import type { JsonObject } from "@/lib/notifications";
import type {
  CreateDevicePairingCodeInput,
  PairDeviceInput
} from "@/lib/validation";

export type DevicePairingCodeStatus =
  | "pending"
  | "used"
  | "expired"
  | "revoked";

export type DeviceRegistrationTokenStatus = "active" | "expired" | "revoked";

export interface DevicePairingCodeRecord {
  id: string;
  code_hash: string;
  subscriber_id: string;
  status: DevicePairingCodeStatus;
  expires_at: string;
  used_at: string | null;
  metadata_json: JsonObject;
  created_at: string;
  updated_at: string;
}

export interface DeviceRegistrationTokenRecord {
  id: string;
  token_hash: string;
  subscriber_id: string;
  status: DeviceRegistrationTokenStatus;
  expires_at: string;
  revoked_at: string | null;
  metadata_json: JsonObject;
  created_at: string;
  updated_at: string;
}

export interface DevicePairingRepository {
  createPairingCode(input: {
    code_hash: string;
    subscriber_id: string;
    status: DevicePairingCodeStatus;
    expires_at: string;
    metadata_json?: JsonObject;
  }): Promise<DevicePairingCodeRecord>;
  findPairingCodeByHash(codeHash: string): Promise<DevicePairingCodeRecord | null>;
  markPairingCodeUsed(id: string, usedAt: string): Promise<DevicePairingCodeRecord | null>;
  createRegistrationToken(input: {
    token_hash: string;
    subscriber_id: string;
    status: DeviceRegistrationTokenStatus;
    expires_at: string;
    metadata_json?: JsonObject;
  }): Promise<DeviceRegistrationTokenRecord>;
  findRegistrationTokenByHash(
    tokenHash: string
  ): Promise<DeviceRegistrationTokenRecord | null>;
}

type DbPairingCodeRow = Omit<
  DevicePairingCodeRecord,
  "expires_at" | "used_at" | "created_at" | "updated_at" | "metadata_json"
> & {
  metadata_json: JsonObject | string | null;
  expires_at: Date | string;
  used_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

type DbRegistrationTokenRow = Omit<
  DeviceRegistrationTokenRecord,
  "expires_at" | "revoked_at" | "created_at" | "updated_at" | "metadata_json"
> & {
  metadata_json: JsonObject | string | null;
  expires_at: Date | string;
  revoked_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

function toIso(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function coerceJsonObject(value: unknown): JsonObject {
  if (!value) {
    return {};
  }

  if (typeof value === "string") {
    try {
      return coerceJsonObject(JSON.parse(value) as unknown);
    } catch {
      return {};
    }
  }

  if (typeof value === "object" && !Array.isArray(value)) {
    return value as JsonObject;
  }

  return {};
}

function serializePairingCode(row: DbPairingCodeRow): DevicePairingCodeRecord {
  return {
    ...row,
    metadata_json: coerceJsonObject(row.metadata_json),
    expires_at: toIso(row.expires_at),
    used_at: row.used_at ? toIso(row.used_at) : null,
    created_at: toIso(row.created_at),
    updated_at: toIso(row.updated_at)
  };
}

function serializeRegistrationToken(
  row: DbRegistrationTokenRow
): DeviceRegistrationTokenRecord {
  return {
    ...row,
    metadata_json: coerceJsonObject(row.metadata_json),
    expires_at: toIso(row.expires_at),
    revoked_at: row.revoked_at ? toIso(row.revoked_at) : null,
    created_at: toIso(row.created_at),
    updated_at: toIso(row.updated_at)
  };
}

export class DevicePairingError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
  }
}

export function hashSecret(secret: string) {
  return createHash("sha256").update(secret, "utf8").digest("hex");
}

export function normalizePairingCode(code: string) {
  return code.trim().toUpperCase().replace(/[\s-]+/g, "");
}

export function generatePairingCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(8);
  const chars = Array.from(bytes, (byte) => alphabet[byte % alphabet.length]);
  return `${chars.slice(0, 4).join("")}-${chars.slice(4, 8).join("")}`;
}

export function generateRegistrationToken() {
  return `attn_drt_${randomBytes(24).toString("base64url")}`;
}

export function redactPairingCode(code: string) {
  const normalized = normalizePairingCode(code);
  if (normalized.length <= 4) {
    return "****";
  }

  return `${normalized.slice(0, 2)}**-****`;
}

export function getPostgresDevicePairingRepository(): DevicePairingRepository {
  const sql = getSql();

  return {
    async createPairingCode(input) {
      const rows = (await sql`
        insert into device_pairing_codes (
          code_hash,
          subscriber_id,
          status,
          expires_at,
          metadata_json
        )
        values (
          ${input.code_hash},
          ${input.subscriber_id},
          ${input.status},
          ${input.expires_at},
          ${JSON.stringify(input.metadata_json ?? {})}::jsonb
        )
        returning *
      `) as unknown as DbPairingCodeRow[];
      const [row] = rows;

      return serializePairingCode(row);
    },

    async findPairingCodeByHash(codeHash) {
      const rows = (await sql`
        select *
        from device_pairing_codes
        where code_hash = ${codeHash}
        limit 1
      `) as unknown as DbPairingCodeRow[];
      const [row] = rows;

      return row ? serializePairingCode(row) : null;
    },

    async markPairingCodeUsed(id, usedAt) {
      const rows = (await sql`
        update device_pairing_codes
        set status = 'used',
            used_at = ${usedAt}
        where id = ${id}
        returning *
      `) as unknown as DbPairingCodeRow[];
      const [row] = rows;

      return row ? serializePairingCode(row) : null;
    },

    async createRegistrationToken(input) {
      const rows = (await sql`
        insert into device_registration_tokens (
          token_hash,
          subscriber_id,
          status,
          expires_at,
          metadata_json
        )
        values (
          ${input.token_hash},
          ${input.subscriber_id},
          ${input.status},
          ${input.expires_at},
          ${JSON.stringify(input.metadata_json ?? {})}::jsonb
        )
        returning *
      `) as unknown as DbRegistrationTokenRow[];
      const [row] = rows;

      return serializeRegistrationToken(row);
    },

    async findRegistrationTokenByHash(tokenHash) {
      const rows = (await sql`
        select *
        from device_registration_tokens
        where token_hash = ${tokenHash}
        limit 1
      `) as unknown as DbRegistrationTokenRow[];
      const [row] = rows;

      return row ? serializeRegistrationToken(row) : null;
    }
  };
}

function getRepository(repository?: DevicePairingRepository) {
  return repository ?? getPostgresDevicePairingRepository();
}

function assertPairingCodeExchangeable(
  record: DevicePairingCodeRecord | null,
  now: Date
): asserts record is DevicePairingCodeRecord {
  if (!record) {
    throw new DevicePairingError("Invalid pairing code", 401);
  }

  if (record.status === "used") {
    throw new DevicePairingError("Pairing code has already been used", 409);
  }

  if (record.status === "revoked") {
    throw new DevicePairingError("Pairing code has been revoked", 410);
  }

  if (record.status === "expired" || new Date(record.expires_at) <= now) {
    throw new DevicePairingError("Pairing code has expired", 410);
  }
}

function assertRegistrationTokenUsable(
  record: DeviceRegistrationTokenRecord | null,
  now: Date
): asserts record is DeviceRegistrationTokenRecord {
  if (!record) {
    throw new DevicePairingError("Invalid device registration token", 401);
  }

  if (record.status === "revoked" || record.revoked_at) {
    throw new DevicePairingError("Device registration token has been revoked", 401);
  }

  if (record.status === "expired" || new Date(record.expires_at) <= now) {
    throw new DevicePairingError("Device registration token has expired", 401);
  }
}

export async function createDevicePairingCode(
  input: CreateDevicePairingCodeInput,
  options: {
    repository?: DevicePairingRepository;
    subscriberRepository?: SubscriberRepository;
    now?: () => Date;
    generateCode?: () => string;
    env?: NodeJS.ProcessEnv;
  } = {}
) {
  const now = options.now?.() ?? new Date();
  const expiresAt = new Date(
    now.getTime() + input.expires_in_minutes * 60 * 1000
  );
  const subscriber = await resolveTargetSubscriber(input.subscriber_id, {
    repository: options.subscriberRepository,
    env: options.env
  });
  const pairingCode = options.generateCode?.() ?? generatePairingCode();
  const normalizedCode = normalizePairingCode(pairingCode);
  const repository = getRepository(options.repository);
  const record = await repository.createPairingCode({
    code_hash: hashSecret(normalizedCode),
    subscriber_id: subscriber.id,
    status: "pending",
    expires_at: expiresAt.toISOString(),
    metadata_json: input.metadata
  });

  return {
    pairing_code: pairingCode,
    expires_at: record.expires_at,
    pairing_code_id: record.id,
    subscriber: redactSubscriber(subscriber)
  };
}

export async function exchangeDevicePairingCode(
  input: PairDeviceInput,
  options: {
    repository?: DevicePairingRepository;
    now?: () => Date;
    generateToken?: () => string;
  } = {}
) {
  const now = options.now?.() ?? new Date();
  const repository = getRepository(options.repository);
  const normalizedCode = normalizePairingCode(input.pairing_code);
  const pairingRecord = await repository.findPairingCodeByHash(
    hashSecret(normalizedCode)
  );
  assertPairingCodeExchangeable(pairingRecord, now);

  const usedRecord = await repository.markPairingCodeUsed(
    pairingRecord.id,
    now.toISOString()
  );
  if (!usedRecord) {
    throw new DevicePairingError("Unable to consume pairing code", 409);
  }

  const registrationToken = options.generateToken?.() ?? generateRegistrationToken();
  const tokenRecord = await repository.createRegistrationToken({
    token_hash: hashSecret(registrationToken),
    subscriber_id: usedRecord.subscriber_id,
    status: "active",
    expires_at: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
    metadata_json: {
      pairing_code_id: usedRecord.id,
      device_name: input.device_name,
      pairing_metadata: input.metadata
    }
  });

  return {
    subscriber_id: tokenRecord.subscriber_id,
    registration_token: registrationToken,
    registration_token_expires_at: tokenRecord.expires_at
  };
}

export async function verifyDeviceRegistrationToken(
  token: string | null | undefined,
  options: {
    repository?: DevicePairingRepository;
    now?: () => Date;
  } = {}
) {
  if (!token) {
    throw new DevicePairingError("Device registration token is required", 401);
  }

  const now = options.now?.() ?? new Date();
  const repository = getRepository(options.repository);
  const tokenRecord = await repository.findRegistrationTokenByHash(
    hashSecret(token)
  );
  assertRegistrationTokenUsable(tokenRecord, now);

  return {
    subscriber_id: tokenRecord.subscriber_id,
    token_id: tokenRecord.id,
    expires_at: tokenRecord.expires_at
  };
}

export function redactSubscriber(subscriber: SubscriberRecord) {
  return {
    id: subscriber.id,
    external_id: subscriber.external_id,
    display_name: subscriber.display_name,
    email: subscriber.email,
    novu_subscriber_id: subscriber.novu_subscriber_id
  };
}
