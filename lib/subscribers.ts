import { getSql } from "@/lib/db";

export interface SubscriberRecord {
  id: string;
  external_id: string;
  display_name: string | null;
  email: string | null;
  novu_subscriber_id: string | null;
  created_at: string;
  updated_at: string;
}

type DbSubscriberRow = Omit<SubscriberRecord, "created_at" | "updated_at"> & {
  created_at: Date | string;
  updated_at: Date | string;
};

export interface SubscriberRepository {
  findSubscriber(id: string): Promise<SubscriberRecord | null>;
  findByExternalId(externalId: string): Promise<SubscriberRecord | null>;
  ensureDefaultSubscriber(input?: {
    external_id?: string;
    display_name?: string;
    email?: string;
    novu_subscriber_id?: string;
  }): Promise<SubscriberRecord>;
}

function toIso(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function serializeSubscriber(row: DbSubscriberRow): SubscriberRecord {
  return {
    ...row,
    created_at: toIso(row.created_at),
    updated_at: toIso(row.updated_at)
  };
}

export function getDefaultSubscriberExternalId(env = process.env) {
  return env.ATTN_DEFAULT_SUBSCRIBER_EXTERNAL_ID || "attn-operator";
}

export function getDefaultNovuSubscriberId(env = process.env) {
  return env.NOVU_SUBSCRIBER_ID || getDefaultSubscriberExternalId(env);
}

export function getPostgresSubscriberRepository(): SubscriberRepository {
  const sql = getSql();

  return {
    async findSubscriber(id) {
      const rows = (await sql`
        select *
        from subscribers
        where id = ${id}
        limit 1
      `) as unknown as DbSubscriberRow[];
      const [row] = rows;

      return row ? serializeSubscriber(row) : null;
    },

    async findByExternalId(externalId) {
      const rows = (await sql`
        select *
        from subscribers
        where external_id = ${externalId}
        limit 1
      `) as unknown as DbSubscriberRow[];
      const [row] = rows;

      return row ? serializeSubscriber(row) : null;
    },

    async ensureDefaultSubscriber(input) {
      const externalId = input?.external_id || getDefaultSubscriberExternalId();
      const rows = (await sql`
        insert into subscribers (
          external_id,
          display_name,
          email,
          novu_subscriber_id
        )
        values (
          ${externalId},
          ${input?.display_name ?? "Default Attn operator"},
          ${input?.email ?? null},
          ${input?.novu_subscriber_id ?? getDefaultNovuSubscriberId()}
        )
        on conflict (external_id) do update
        set updated_at = now()
        returning *
      `) as unknown as DbSubscriberRow[];
      const [row] = rows;

      return serializeSubscriber(row);
    }
  };
}

function getRepository(repository?: SubscriberRepository) {
  return repository ?? getPostgresSubscriberRepository();
}

export async function resolveTargetSubscriber(
  subscriberId?: string,
  options: { repository?: SubscriberRepository; env?: NodeJS.ProcessEnv } = {}
) {
  const repository = getRepository(options.repository);

  if (subscriberId) {
    const existing = await repository.findSubscriber(subscriberId);
    if (existing) {
      return existing;
    }
  }

  return repository.ensureDefaultSubscriber({
    external_id: getDefaultSubscriberExternalId(options.env),
    novu_subscriber_id: getDefaultNovuSubscriberId(options.env)
  });
}
