-- 공개용 트리 편지(tree-letter-public) 테스트용 Supabase 설정
-- 사용법: Supabase 대시보드 → SQL Editor → New query → 이 파일 내용 전체를 붙여넣고 Run.
-- 내부 행사용(tree-letter)과 같은 테이블 이름을 쓰지만, team이 숫자가 아니라 그룹 코드(문자)예요.

-- 그룹 트리 설정: 만든 사람이 정한 이름 · 트리 모양 · 배경
create table if not exists public.tl_settings (
  team       text primary key,                 -- 그룹 코드 (예: k8x2mq). 링크 ?g=코드 로 들어와요.
  name       text not null check (char_length(name) between 1 and 20),
  tree       smallint not null default 1 check (tree between 1 and 4),
  bg         text not null default 'bg-1',
  owner      text,                              -- 만든 기기의 고유번호 (화면에서 구분용)
  created_at timestamptz not null default now()
);

-- 트리에 단 오너먼트
create table if not exists public.tl_ornaments (
  id         uuid primary key,
  team       text not null references public.tl_settings(team) on delete cascade,
  type       text not null,
  x          real not null,
  y          real not null,
  nick       text not null default '',
  owner      text,                              -- 단 기기의 고유번호. 자기 것만 옮기고 지우는 버튼을 보여줄 때 써요.
  created_at timestamptz not null default now()
);
create index if not exists tl_ornaments_team_idx on public.tl_ornaments(team);

-- 편지 (최대 30자)
create table if not exists public.tl_letters (
  id         uuid primary key,
  team       text not null references public.tl_settings(team) on delete cascade,
  nick       text not null default '',
  text       text not null check (char_length(text) between 1 and 30),
  owner      text,
  created_at timestamptz not null default now()
);
create index if not exists tl_letters_team_idx on public.tl_letters(team);

-- 보안 규칙(RLS): MVP라서 누구나 읽고 쓸 수 있게 열어 둬요.
-- "자기 것만 수정"은 화면에서 버튼을 숨기는 방식이에요. 정식 공개 전에 익명 로그인 + 규칙으로 강화하는 걸 권장해요.
alter table public.tl_settings  enable row level security;
alter table public.tl_ornaments enable row level security;
alter table public.tl_letters   enable row level security;

drop policy if exists "mvp all" on public.tl_settings;
drop policy if exists "mvp all" on public.tl_ornaments;
drop policy if exists "mvp all" on public.tl_letters;
create policy "mvp all" on public.tl_settings  for all to anon using (true) with check (true);
create policy "mvp all" on public.tl_ornaments for all to anon using (true) with check (true);
create policy "mvp all" on public.tl_letters   for all to anon using (true) with check (true);

-- 실시간: 다른 사람이 단 오너먼트 · 편지가 바로 보이도록 켜요.
alter publication supabase_realtime add table public.tl_settings, public.tl_ornaments, public.tl_letters;
