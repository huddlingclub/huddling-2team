/* 미리보기 모드용 가짜 DB
   script.js에 Supabase 키가 비어 있으면 이 파일을 대신 써요.
   데이터는 이 브라우저(localStorage)에만 저장돼서, 혼자 화면을 확인할 때만 쓸 수 있어요.
   Supabase에서 script.js가 쓰는 기능(select · eq · order · limit · insert · upsert · update · delete · single)만 흉내 내요. */
(() => {
  'use strict';

  const KEY = (table) => `tl:local:${table}`;
  const read = (table) => {
    try {
      return JSON.parse(localStorage.getItem(KEY(table)) || '[]');
    } catch {
      return [];
    }
  };
  const write = (table, rows) => {
    try {
      localStorage.setItem(KEY(table), JSON.stringify(rows));
    } catch {
      /* 저장이 막힌 브라우저에서는 새로고침하면 사라져요 */
    }
  };
  // 표마다 한 줄을 구분하는 칸 (Supabase의 기본키와 같아요)
  const PK = { tl_settings: 'team', tl_ornaments: 'id', tl_letters: 'id' };

  class Query {
    constructor(table) {
      this.table = table;
      this.op = 'select';
      this.filters = [];
      this.sort = null;
      this.max = null;
      this.one = null; // 'single' | 'maybe'
      this.payload = null;
    }
    // 읽을 칸을 고르는 부분은 무시하고 줄 전체를 돌려줘요.
    select() {
      return this;
    }
    eq(key, value) {
      this.filters.push([key, value]);
      return this;
    }
    order(key, { ascending = true } = {}) {
      this.sort = { key, ascending };
      return this;
    }
    limit(n) {
      this.max = n;
      return this;
    }
    single() {
      this.one = 'single';
      return this;
    }
    maybeSingle() {
      this.one = 'maybe';
      return this;
    }
    insert(row) {
      this.op = 'insert';
      this.payload = row;
      return this;
    }
    upsert(row) {
      this.op = 'upsert';
      this.payload = row;
      return this;
    }
    update(patch) {
      this.op = 'update';
      this.payload = patch;
      return this;
    }
    delete() {
      this.op = 'delete';
      return this;
    }
    match(row) {
      return this.filters.every(([k, v]) => row[k] === v);
    }
    run() {
      const pk = PK[this.table] || 'id';
      let rows = read(this.table);
      let out = [];
      if (this.op === 'select') {
        out = rows.filter((r) => this.match(r));
        if (this.sort) {
          const { key, ascending } = this.sort;
          out.sort((a, b) => (a[key] > b[key] ? 1 : a[key] < b[key] ? -1 : 0) * (ascending ? 1 : -1));
        }
        if (this.max != null) out = out.slice(0, this.max);
      } else if (this.op === 'insert' || this.op === 'upsert') {
        const row = { created_at: new Date().toISOString(), ...this.payload };
        const i = rows.findIndex((r) => r[pk] === row[pk]);
        if (i >= 0 && this.op === 'insert') return { data: null, error: { message: 'duplicate' } };
        if (i >= 0) rows[i] = { ...rows[i], ...row };
        else rows.push(row);
        write(this.table, rows);
        out = [i >= 0 ? rows[i] : row];
      } else if (this.op === 'update') {
        rows = rows.map((r) => (this.match(r) ? { ...r, ...this.payload } : r));
        write(this.table, rows);
        out = rows.filter((r) => this.match(r));
      } else if (this.op === 'delete') {
        out = rows.filter((r) => this.match(r));
        write(
          this.table,
          rows.filter((r) => !this.match(r))
        );
      }
      if (this.one) {
        if (out.length === 0 && this.one === 'single') return { data: null, error: { message: 'not_found' } };
        return { data: out[0] || null, error: null };
      }
      return { data: out, error: null };
    }
    then(resolve, reject) {
      try {
        resolve(this.run());
      } catch (err) {
        reject(err);
      }
    }
  }

  window.TLLocalDB = { from: (table) => new Query(table) };
})();
