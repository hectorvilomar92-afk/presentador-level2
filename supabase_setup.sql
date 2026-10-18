create table if not exists public.perfiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nombre text not null default '',
  email text not null unique,
  rol text not null default 'usuario' check (rol in ('admin', 'usuario')),
  activo boolean not null default true,
  vence date,
  creado_en timestamptz not null default now()
);

alter table public.perfiles enable row level security;

create or replace function public.es_admin_actual()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.perfiles
    where id = auth.uid()
      and rol = 'admin'
      and activo = true
  );
$$;

revoke all on function public.es_admin_actual() from public;
grant execute on function public.es_admin_actual() to authenticated;

grant usage on schema public to authenticated;
grant select, update on public.perfiles to authenticated;

drop policy if exists perfiles_ver_autorizados on public.perfiles;
create policy perfiles_ver_autorizados
  on public.perfiles for select to authenticated
  using (id = auth.uid() or public.es_admin_actual());

drop policy if exists perfiles_actualizar_admin on public.perfiles;
create policy perfiles_actualizar_admin
  on public.perfiles for update to authenticated
  using (public.es_admin_actual())
  with check (public.es_admin_actual());

create or replace function public.proteger_ultimo_administrador()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.rol = 'admin' and old.activo
     and (new.rol <> 'admin' or not new.activo) then
    if old.id = auth.uid() then
      raise exception 'No puedes quitarte tu propio acceso de administrador';
    end if;

    if not exists (
      select 1
      from public.perfiles
      where id <> old.id
        and rol = 'admin'
        and activo = true
    ) then
      raise exception 'Debe permanecer al menos un administrador activo';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists perfiles_proteger_admin on public.perfiles;
create trigger perfiles_proteger_admin
  before update on public.perfiles
  for each row execute function public.proteger_ultimo_administrador();

create table if not exists public.avisos (
  id uuid primary key default gen_random_uuid(),
  destinatario_id uuid references public.perfiles(id) on delete cascade,
  titulo text not null check (char_length(btrim(titulo)) between 1 and 100),
  mensaje text not null check (char_length(btrim(mensaje)) between 1 and 1000),
  creado_por uuid not null references public.perfiles(id),
  creado_en timestamptz not null default now(),
  vence_en timestamptz not null default (now() + interval '1 minute')
);

create or replace function public.fijar_duracion_aviso()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.creado_en := now();
  new.vence_en := new.creado_en + interval '1 minute';
  return new;
end;
$$;

drop trigger if exists avisos_duracion_un_minuto on public.avisos;
create trigger avisos_duracion_un_minuto
  before insert on public.avisos
  for each row execute function public.fijar_duracion_aviso();

alter table public.avisos enable row level security;
grant select, insert, delete on public.avisos to authenticated;

drop policy if exists avisos_ver_destinatario on public.avisos;
create policy avisos_ver_destinatario
  on public.avisos for select to authenticated
  using (
    (
      vence_en > now()
      and (destinatario_id = auth.uid() or destinatario_id is null)
    )
    or public.es_admin_actual()
  );

drop policy if exists avisos_enviar_admin on public.avisos;
create policy avisos_enviar_admin
  on public.avisos for insert to authenticated
  with check (
    public.es_admin_actual()
    and creado_por = auth.uid()
  );

drop policy if exists avisos_borrar_vencidos_admin on public.avisos;
create policy avisos_borrar_vencidos_admin
  on public.avisos for delete to authenticated
  using (public.es_admin_actual() and vence_en <= now());
