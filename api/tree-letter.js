// features/tree-letter 의 저장용 API (Vercel Function).
// 저장소: Vercel 프로젝트에 연결한 Upstash Redis (Storage 탭에서 연결하면 환경변수가 자동으로 들어와요).
// 키 · 토큰은 코드에 쓰지 않고 환경변수로만 읽어요.
const { randomUUID } = require('node:crypto');
const { Redis } = require('@upstash/redis');

// features/tree-letter/script.js 의 값과 맞춰야 해요.
const TEAM_COUNT = 6;
const NICK_MAX = 10;
const LETTER_MAX = 30;
const ORNAMENT_TYPES = ['ball', 'star', 'heart', 'gift', 'bell', 'snow', 'candy', 'cookie'];
const BACKGROUNDS = ['night', 'snow', 'warm', 'forest'];
const LETTER_IMAGES = ['heart', 'star', 'gift', 'snow'];
const MAX_ORNAMENTS = 200; // 조별 트리 하나에 달 수 있는 개수
const MAX_LETTERS = 500;

const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const redis = url && token ? new Redis({ url, token }) : null;

const keys = (team) => ({
  ornaments: `tl:team:${team}:ornaments`,
  letters: `tl:team:${team}:letters`,
  bg: `tl:team:${team}:bg`,
});

const length = (s) => [...s].length;
const fail = (res, status, error) => res.status(status).json({ error });

function parseTeam(value) {
  const team = Number(value);
  return Number.isInteger(team) && team >= 1 && team <= TEAM_COUNT ? team : null;
}

function parseSid(value) {
  return typeof value === 'string' && value.length >= 8 && value.length <= 64 ? value : null;
}

// 다른 사람의 sid 는 내보내지 않고, 내 것인지만 알려줘요.
function publicList(hash, sid) {
  return Object.values(hash || {})
    .map(({ sid: owner, ...rest }) => ({ ...rest, mine: owner === sid }))
    .sort((a, b) => a.at - b.at);
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!redis) return fail(res, 503, 'storage_not_configured');

  try {
    if (req.method === 'GET') {
      const team = parseTeam(req.query.team);
      if (!team) return fail(res, 400, 'bad_team');
      const sid = parseSid(req.query.sid) || '';
      const k = keys(team);
      const [ornaments, letters, bg] = await Promise.all([
        redis.hgetall(k.ornaments),
        redis.hgetall(k.letters),
        redis.get(k.bg),
      ]);
      return res.status(200).json({
        ornaments: publicList(ornaments, sid),
        letters: publicList(letters, sid),
        bg: BACKGROUNDS.includes(bg) ? bg : 'night',
      });
    }

    if (req.method !== 'POST' && req.method !== 'DELETE') {
      res.setHeader('Allow', 'GET, POST, DELETE');
      return fail(res, 405, 'method_not_allowed');
    }

    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const team = parseTeam(body.team);
    const sid = parseSid(body.sid);
    if (!team) return fail(res, 400, 'bad_team');
    if (!sid) return fail(res, 400, 'bad_session');
    const k = keys(team);

    if (req.method === 'DELETE') {
      if (typeof body.id !== 'string') return fail(res, 400, 'bad_id');
      const item = await redis.hget(k.ornaments, body.id);
      if (!item) return res.status(200).json({ ok: true });
      if (item.sid !== sid) return fail(res, 403, 'not_yours');
      await redis.hdel(k.ornaments, body.id);
      return res.status(200).json({ ok: true });
    }

    if (body.kind === 'bg') {
      if (!BACKGROUNDS.includes(body.bg)) return fail(res, 400, 'bad_bg');
      await redis.set(k.bg, body.bg);
      return res.status(200).json({ ok: true });
    }

    const nick = typeof body.nick === 'string' ? body.nick.trim() : '';
    if (!nick || length(nick) > NICK_MAX) return fail(res, 400, 'bad_nick');

    if (body.kind === 'ornament') {
      const { type, x, y } = body;
      const inRange = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100;
      if (!ORNAMENT_TYPES.includes(type) || !inRange(x) || !inRange(y)) return fail(res, 400, 'bad_ornament');
      if ((await redis.hlen(k.ornaments)) >= MAX_ORNAMENTS) return fail(res, 409, 'full');
      const item = { id: randomUUID(), type, x, y, nick, sid, at: Date.now() };
      await redis.hset(k.ornaments, { [item.id]: item });
      return res.status(200).json({ ok: true });
    }

    if (body.kind === 'letter') {
      const text = typeof body.text === 'string' ? body.text.trim() : '';
      if (!text || length(text) > LETTER_MAX) return fail(res, 400, 'bad_text');
      const image = LETTER_IMAGES.includes(body.image) ? body.image : null;
      if ((await redis.hlen(k.letters)) >= MAX_LETTERS) return fail(res, 409, 'full');
      const item = { id: randomUUID(), text, image, nick, sid, at: Date.now() };
      await redis.hset(k.letters, { [item.id]: item });
      return res.status(200).json({ ok: true });
    }

    return fail(res, 400, 'bad_kind');
  } catch (err) {
    console.error('tree-letter api error', err);
    return fail(res, 500, 'server_error');
  }
};
