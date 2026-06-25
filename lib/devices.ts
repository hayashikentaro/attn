import { createHash } from "node:crypto";
import { getSql } from "@/lib/db";
import { updateNovuSubscriberCredentials } from "@/lib/novu";
import {
  resolveTargetSubscriber,
  type SubscriberRepository
} from "@/lib/subscribers";
import type {
  DevicePlatform,
  DeviceProvider,
  RegisterDeviceInput,
  UnregisterDeviceInput
} from "@/lib/validation";
import type { JsonObject } from "@/lib/notifications";

export interface DeviceRecord {
  id: string;
  subscriber_id: string;
  platform: DevicePlatform;
  provider: DeviceProvider;
  device_token_hash: string;
  device_name: string | null;
  last_seen_at: string;
  revoked_at: string | null;
  metadata_json: JsonObject;
  created_at: string;
  updated_at: string;
}

export interface DeviceRepository {
  upsertDevice(input: {
    subscriber_id: string;
    platform: DevicePlatform;
    provider: DeviceProvider;
    device_token_hash: string;
    device_name?: string;
    metadata_json?: JsonObject;
    last_seen_at: string;
  }): Promise<DeviceRecord>;
  revokeDevice(input: {
    device_id?: string;
    provider?: DeviceProvider;
    device_token_hash?: string;
    revoked_at: string;
  }): Promise<DeviceRecord | null>;
}

type DbDeviceRow = Omit<
  DeviceRecord,
  "created_at" | "updated_at" | "last_seen_at" | "revoked_at" | "metadata_json"
> & {
  metadata_json: JsonObject | string | null;
  last_seen_at: Date | string;
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

function serializeDevice(row: DbDeviceRow): DeviceRecord {
  return {
    ...row,
    metadata_json: coerceJsonObject(row.metadata_json),
    last_seen_at: toIso(row.last_seen_at),
    revoked_at: row.revoked_at ? toIso(row.revoked_at) : null,
    created_at: toIso(row.created_at),
    updated_at: toIso(row.updated_at)
  };
}

export function hashDeviceToken(deviceToken: string) {
  return createHash("sha256").update(deviceToken, "utf8").digest("hex");
}

export function redactDevice(device: DeviceRecord) {
  return {
    id: device.id,
    subscriber_id: device.subscriber_id,
    platform: device.platform,
    provider: device.provider,
    device_token_hash: device.device_token_hash,
    device_name: device.device_name,
    last_seen_at: device.last_seen_at,
    revoked_at: device.revoked_at,
    metadata: device.metadata_json,
    created_at: device.created_at,
    updated_at: device.updated_at
  };
}

export function getPostgresDeviceRepository(): DeviceRepository {
  const sql = getSql();

  return {
    async upsertDevice(input) {
      const rows = (await sql`
        insert into subscriber_devices (
          subscriber_id,
          platform,
          provider,
          device_token_hash,
          device_name,
          last_seen_at,
          revoked_at,
          metadata_json
        )
        values (
          ${input.subscriber_id},
          ${input.platform},
          ${input.provider},
          ${input.device_token_hash},
          ${input.device_name ?? null},
          ${input.last_seen_at},
          null,
          ${JSON.stringify(input.metadata_json ?? {})}::jsonb
        )
        on conflict (subscriber_id, provider, device_token_hash) do update
        set platform = excluded.platform,
            device_name = excluded.device_name,
            last_seen_at = excluded.last_seen_at,
            revoked_at = null,
            metadata_json = excluded.metadata_json
        returning *
      `) as unknown as DbDeviceRow[];
      const [row] = rows;

      return serializeDevice(row);
    },

    async revokeDevice(input) {
      const rows = input.device_id
        ? ((await sql`
            update subscriber_devices
            set revoked_at = ${input.revoked_at}
            where id = ${input.device_id}
            returning *
          `) as unknown as DbDeviceRow[])
        : ((await sql`
            update subscriber_devices
            set revoked_at = ${input.revoked_at}
            where provider = ${input.provider ?? ""}
              and device_token_hash = ${input.device_token_hash ?? ""}
            returning *
          `) as unknown as DbDeviceRow[]);
      const [row] = rows;

      return row ? serializeDevice(row) : null;
    }
  };
}

export async function registerDevice(
  input: RegisterDeviceInput,
  options: {
    deviceRepository?: DeviceRepository;
    subscriberRepository?: SubscriberRepository;
    env?: NodeJS.ProcessEnv;
    now?: () => Date;
    updateNovuCredentials?: typeof updateNovuSubscriberCredentials;
  } = {}
) {
  const subscriber = await resolveTargetSubscriber(input.subscriber_id, {
    repository: options.subscriberRepository,
    env: options.env
  });
  const deviceRepository =
    options.deviceRepository ?? getPostgresDeviceRepository();

  const device = await deviceRepository.upsertDevice({
    subscriber_id: subscriber.id,
    platform: input.platform,
    provider: input.provider,
    device_token_hash: hashDeviceToken(input.device_token),
    device_name: input.device_name,
    metadata_json: input.metadata,
    last_seen_at: (options.now?.() ?? new Date()).toISOString()
  });

  if (subscriber.novu_subscriber_id) {
    await (options.updateNovuCredentials ?? updateNovuSubscriberCredentials)(
      {
        novu_subscriber_id: subscriber.novu_subscriber_id,
        provider: input.provider,
        device_token_hash: device.device_token_hash
      },
      options.env
    );
  }

  return {
    subscriber,
    device
  };
}

export async function unregisterDevice(
  input: UnregisterDeviceInput,
  options: { deviceRepository?: DeviceRepository; now?: () => Date } = {}
) {
  const deviceRepository =
    options.deviceRepository ?? getPostgresDeviceRepository();

  return deviceRepository.revokeDevice({
    device_id: input.device_id,
    provider: input.provider,
    device_token_hash: input.device_token
      ? hashDeviceToken(input.device_token)
      : undefined,
    revoked_at: (options.now?.() ?? new Date()).toISOString()
  });
}
