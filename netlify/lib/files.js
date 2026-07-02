// Portable uploaded-file storage: bytes live in a Postgres table instead of a
// host-specific blob service, so the API runs unchanged on Netlify, Cloudflare
// Workers, or any Node server — the database is the only stateful dependency.
//
// Bytes travel as hex through encode()/decode() so the same code works on
// every Postgres driver (the Neon HTTP driver included) without bytea
// parameter-binding quirks. Files are capped at 4 MB upstream, so the hex
// doubling is a non-issue.
//
// The table is created by ensureSchema in data.js alongside everything else.

export function fileStore(sql) {
  return {
    // Upsert so a retried upload with the same key can't fail on the PK.
    async set(key, buffer) {
      const hex = Buffer.from(buffer).toString("hex");
      await sql`insert into file_blobs (key, data) values (${key}, decode(${hex}, 'hex'))
        on conflict (key) do update set data = excluded.data`;
    },

    // Returns a Buffer, or null when the key doesn't exist.
    async get(key) {
      const rows = await sql`select encode(data, 'hex') as hex from file_blobs where key=${key} limit 1`;
      return rows.length ? Buffer.from(rows[0].hex, "hex") : null;
    },

    async delete(key) {
      await sql`delete from file_blobs where key=${key}`;
    },
  };
}
