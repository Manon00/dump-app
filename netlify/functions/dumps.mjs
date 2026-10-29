import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);
const json = (b, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json' } });

export default async (req) => {
  if (req.headers.get('x-pin') !== process.env.APP_PIN) return json({ error: 'unauthorized' }, 401);
  const url = new URL(req.url);
  const kind = url.searchParams.get('kind') || 'dumps';
  const body = req.method === 'POST' || req.method === 'PATCH' ? await req.json() : {};

  try {
    if (req.method === 'GET') {
      const [dumps, categories, tags] = await Promise.all([
        sql`select id, text, cat, tags, to_char(created_on,'YYYY-MM-DD') as date
            from dumps order by created_on desc, id desc`,
        sql`select name, color from categories order by name`,
        sql`select name from tags order by name`,
      ]);
      return json({ dumps, categories, tags: tags.map(t => t.name) });
    }

    if (kind === 'dumps') {
      if (req.method === 'POST') {
        const { text, cat, tags = [] } = body;
        const [ok] = await sql`select 1 from categories where name = ${cat}`;
        if (!text?.trim() || !ok) return json({ error: 'bad input' }, 400);
        await sql`insert into tags (name) select unnest(${tags}::text[]) on conflict do nothing`;
        const [row] = await sql`
          insert into dumps (text, cat, tags) values (${text.trim()}, ${cat}, ${tags})
          returning id, text, cat, tags, to_char(created_on,'YYYY-MM-DD') as date`;
        return json(row, 201);
      }
      if (req.method === 'DELETE') {
        await sql`delete from dumps where id = ${Number(url.searchParams.get('id'))}`;
        return json({ ok: true });
      }
    }

    if (kind === 'categories') {
      if (req.method === 'POST') {
        await sql`insert into categories (name, color) values (${body.name}, ${body.color})`;
        return json({ ok: true }, 201);
      }
      if (req.method === 'PATCH') {
        await sql.transaction([
          sql`update categories set name = ${body.name}, color = ${body.color} where name = ${body.old}`,
          sql`update dumps set cat = ${body.name} where cat = ${body.old}`,
        ]);
        return json({ ok: true });
      }
      if (req.method === 'DELETE') {
        const name = url.searchParams.get('name');
        const [{ n }] = await sql`select count(*)::int as n from dumps where cat = ${name}`;
        if (n) return json({ error: 'in use', n }, 409);
        await sql`delete from categories where name = ${name}`;
        return json({ ok: true });
      }
    }

    if (kind === 'tags') {
      if (req.method === 'POST') {
        await sql`insert into tags (name) values (${body.name}) on conflict do nothing`;
        return json({ ok: true }, 201);
      }
      if (req.method === 'PATCH') {
        await sql.transaction([
          sql`update tags set name = ${body.name} where name = ${body.old}`,
          sql`update dumps set tags = array_replace(tags, ${body.old}, ${body.name}) where ${body.old} = any(tags)`,
        ]);
        return json({ ok: true });
      }
      if (req.method === 'DELETE') {
        const name = url.searchParams.get('name');
        await sql.transaction([
          sql`delete from tags where name = ${name}`,
          sql`update dumps set tags = array_remove(tags, ${name}) where ${name} = any(tags)`,
        ]);
        return json({ ok: true });
      }
    }

    return json({ error: 'bad request' }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: 'server' }, 500);
  }
};