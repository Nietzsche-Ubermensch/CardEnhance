-- Card catalog and audit log. Unowned rows (auth is off).
create table if not exists cards (
  id text primary key,
  source_id text not null,
  filename text not null,
  player text,
  set_name text,
  manufacturer text,
  year integer,
  number text,
  parallel text,
  side text,
  engine text,
  detector text,
  grade integer,
  status text not null default 'completed',
  created_at timestamptz not null default now()
);

create index if not exists cards_created_at_idx on cards (created_at desc);

create table if not exists audit_logs (
  id serial primary key,
  action text not null,
  entity_type text,
  entity_id text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_created_at_idx on audit_logs (created_at desc);
