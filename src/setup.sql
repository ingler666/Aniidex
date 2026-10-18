-- Tabla única para la Aniidex: cada fila es un documento (colección + id) de un usuario.
create table if not exists public.docs (
  owner uuid not null default auth.uid() references auth.users on delete cascade,
  coll text not null,
  id text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (owner, coll, id)
);
alter table public.docs enable row level security;
create policy "leer lo mio" on public.docs for select using (auth.uid() = owner);
create policy "crear lo mio" on public.docs for insert with check (auth.uid() = owner);
create policy "editar lo mio" on public.docs for update using (auth.uid() = owner) with check (auth.uid() = owner);
create policy "borrar lo mio" on public.docs for delete using (auth.uid() = owner);
