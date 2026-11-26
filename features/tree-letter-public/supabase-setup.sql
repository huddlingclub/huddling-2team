-- 공개용 트리 편지(tree-letter-public) Supabase 설정
-- 사용법: Supabase 대시보드 → SQL Editor → New query → 이 파일 내용 전체를 붙여넣고 Run.
-- 공개용 전용 프로젝트에서 실행해요. (조별 tree-letter 프로젝트와 테이블 이름이 같아서 같이 쓰면 안 돼요.)
-- 여러 번 실행해도 안전해요.

-- 그룹 트리 설정: 만든 사람이 정한 이름 · 트리 모양 · 배경
create table if not exists public.tl_settings (
  team       text primary key check (team ~ '^[a-z0-9]{6,16}$'),   -- 그룹 코드. 링크 ?g=코드 로 들어와요.
  name       text not null check (char_length(name) between 1 and 20),
  tree       smallint not null default 1 check (tree between 1 and 4),
  bg         text not null default 'bg-1' check (bg in ('bg-1', 'bg-2', 'bg-3')),
  owner      text check (char_length(owner) <= 64),                 -- 만든 기기의 고유번호 (화면에서 구분용)
  created_at timestamptz not null default now()
);

-- 트리에 단 오너먼트
create table if not exists public.tl_ornaments (
  id         uuid primary key,
  team       text not null references public.tl_settings(team) on delete cascade,
  type       text not null check (type in ('snow', 'cookie', 'gift', 'ball', 'penguin-santa', 'penguin-bow', 'claude', 'candy')),
  x          real not null check (x between 0 and 100),
  y          real not null check (y between 0 and 100),
  nick       text not null default '' check (char_length(nick) <= 10),
  owner      text check (char_length(owner) <= 64),
  created_at timestamptz not null default now()
);
create index if not exists tl_ornaments_team_idx on public.tl_ornaments(team);

-- 편지 (최대 30자)
create table if not exists public.tl_letters (
  id         uuid primary key,
  team       text not null references public.tl_settings(team) on delete cascade,
  nick       text not null default '' check (char_length(nick) <= 10),
  text       text not null check (char_length(text) between 1 and 30),
  owner      text check (char_length(owner) <= 64),
  created_at timestamptz not null default now()
);
create index if not exists tl_letters_team_idx on public.tl_letters(team);

-- 보안 규칙(RLS)
-- 로그인이 없어서 "자기 것만 수정"은 화면에서 버튼을 숨기는 방식이에요.
-- DB에서는 화면이 실제로 하는 일만 허용해요.
--   트리 설정: 읽기 · 만들기 · 배경(bg)만 바꾸기. 지우기 없음 (트리 하나를 지우면 편지까지 다 지워지니까요)
--   오너먼트: 읽기 · 달기 · 위치(x, y)만 옮기기 · 지우기
--   편지:     읽기 · 쓰기 · 지우기 (내용 고치기 없음)
alter table public.tl_settings  enable row level security;
alter table public.tl_ornaments enable row level security;
alter table public.tl_letters   enable row level security;

drop policy if exists "mvp all" on public.tl_settings;
drop policy if exists "mvp all" on public.tl_ornaments;
drop policy if exists "mvp all" on public.tl_letters;
drop policy if exists "read"   on public.tl_settings;
drop policy if exists "create" on public.tl_settings;
drop policy if exists "set bg" on public.tl_settings;
drop policy if exists "read"   on public.tl_ornaments;
drop policy if exists "create" on public.tl_ornaments;
drop policy if exists "move"   on public.tl_ornaments;
drop policy if exists "remove" on public.tl_ornaments;
drop policy if exists "read"   on public.tl_letters;
drop policy if exists "create" on public.tl_letters;
drop policy if exists "remove" on public.tl_letters;

create policy "read"   on public.tl_settings  for select to anon using (true);
create policy "create" on public.tl_settings  for insert to anon with check (true);
create policy "set bg" on public.tl_settings  for update to anon using (true) with check (true);

create policy "read"   on public.tl_ornaments for select to anon using (true);
create policy "create" on public.tl_ornaments for insert to anon with check (true);
create policy "move"   on public.tl_ornaments for update to anon using (true) with check (true);
create policy "remove" on public.tl_ornaments for delete to anon using (true);

create policy "read"   on public.tl_letters   for select to anon using (true);
create policy "create" on public.tl_letters   for insert to anon with check (true);
create policy "remove" on public.tl_letters   for delete to anon using (true);

-- 바꿀 수 있는 칸을 정해요: 트리는 배경만, 오너먼트는 위치만.
revoke all on public.tl_settings, public.tl_ornaments, public.tl_letters from anon;
grant select, insert on public.tl_settings  to anon;
grant update (bg)     on public.tl_settings  to anon;
grant select, insert, delete on public.tl_ornaments to anon;
grant update (x, y)   on public.tl_ornaments to anon;
grant select, insert, delete on public.tl_letters   to anon;

-- 실시간: 다른 사람이 단 오너먼트 · 편지가 바로 보이도록 켜요.
do $$
declare t text;
begin
  foreach t in array array['tl_settings', 'tl_ornaments', 'tl_letters'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
