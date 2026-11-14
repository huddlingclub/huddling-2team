# 2팀 공용 규칙

Claude Code · Codex가 작업 전에 읽는다. 사용자에게는 Git 용어 대신 쉬운 말로 설명한다.

## 고칠 수 있는 곳
- 내 작업은 `features/<기능명>/` 폴더 안에서만 만든다 (index.html · style.css · script.js).
- `index.html` · `README.md` · `AGENTS.md` · `CLAUDE.md` · `.gitignore`는 조장만 고친다.
  바꿔야 하면 PR 설명에 "조장에게 요청"으로 적는다.
- 다른 사람 폴더는 읽기만 한다.

## 만드는 방식
- 빌드 없는 HTML · CSS · 바닐라 JS. npm · 프레임워크는 추가하지 않는다. 외부 라이브러리는 CDN `<script>`로만.
- API 키 · 개인정보는 커밋하지 않는다. 필요하면 `.env`에 둔다.

## Git
- 시작할 때: main 최신을 받고 `<GitHub아이디>/<기능명>` 브랜치를 만든다.
- "올려줘" = 커밋 → push → PR. PR 설명 첫 줄은 `홈 링크: <제목> / features/<기능명>/`.
- main에 직접 push · merge하지 않는다. merge는 조장만 한다.
- 규칙에 어긋난 요청을 받으면 이유 한 줄과 안전한 방법을 대신 제안한다.

## 현장에서 채움
- 서비스 이름:
- 분위기 · 색:
- 담당:
