import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { evaluate, type Run } from './engine.js';
import { scenarios } from './scenarios.js';

const hash = (token: string) => createHash('sha256').update(token).digest('hex');
export class RunStore {
  db: DatabaseSync;
  private inTransaction=false;
  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS runs (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, data TEXT NOT NULL); CREATE INDEX IF NOT EXISTS runs_created_at ON runs(created_at); CREATE TABLE IF NOT EXISTS capabilities (hash TEXT PRIMARY KEY, run_id TEXT NOT NULL);');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS run_search (run_id TEXT PRIMARY KEY, search_text TEXT NOT NULL, kind TEXT NOT NULL, verdict TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS run_search_kind ON run_search(kind);
      CREATE INDEX IF NOT EXISTS run_search_verdict ON run_search(verdict);
      CREATE TABLE IF NOT EXISTS run_search_dirty (run_id TEXT PRIMARY KEY);
      CREATE TRIGGER IF NOT EXISTS runs_search_insert AFTER INSERT ON runs BEGIN INSERT OR IGNORE INTO run_search_dirty VALUES (NEW.id); END;
      CREATE TRIGGER IF NOT EXISTS runs_search_update AFTER UPDATE ON runs BEGIN INSERT OR IGNORE INTO run_search_dirty VALUES (NEW.id); END;
      CREATE TRIGGER IF NOT EXISTS runs_search_delete AFTER DELETE ON runs BEGIN DELETE FROM run_search WHERE run_id=OLD.id; DELETE FROM run_search_dirty WHERE run_id=OLD.id; END;
      INSERT OR IGNORE INTO run_search_dirty SELECT r.id FROM runs r LEFT JOIN run_search s ON s.run_id=r.id WHERE s.run_id IS NULL;
    `);
    this.syncSearch();
  }
  private transaction<T>(operation:()=>T):T {
    if(this.inTransaction)return operation();
    this.db.exec('BEGIN IMMEDIATE');this.inTransaction=true;
    try{const result=operation();this.db.exec('COMMIT');return result;}
    catch(error){this.db.exec('ROLLBACK');throw error;}
    finally{this.inTransaction=false;}
  }
  private indexRun(run:Run) {
    const title=scenarios.find(s=>s.id===run.scenario)?.title??'';
    const text=[run.id,run.scenario,title,run.agent,run.execution?.model??'',run.seed].join(' ').toLowerCase();
    this.db.prepare('INSERT INTO run_search VALUES (?, ?, ?, ?) ON CONFLICT(run_id) DO UPDATE SET search_text=excluded.search_text,kind=excluded.kind,verdict=excluded.verdict').run(run.id,text,['careful','reckless'].includes(run.agent)?'reference':'live',evaluate(run).verdict);
    this.db.prepare('DELETE FROM run_search_dirty WHERE run_id=?').run(run.id);
  }
  private syncSearch() {
    if(!this.db.prepare('SELECT 1 FROM run_search_dirty LIMIT 1').get())return;
    this.transaction(()=>{for(const row of this.db.prepare('SELECT r.data FROM runs r JOIN run_search_dirty d ON r.id=d.run_id').all())this.indexRun(JSON.parse(row.data as string));});
  }
  save(run: Run) { this.transaction(()=>{this.db.prepare('INSERT INTO runs (id, created_at, data) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(run.id, run.created_at, JSON.stringify(run));this.indexRun(run);}); }
  get(id: string): Run | undefined { const row = this.db.prepare('SELECT data FROM runs WHERE id=?').get(id); return row ? JSON.parse(row.data as string) : undefined; }
  mutate<T>(id: string, change: (run: Run) => T): T {
    return this.transaction(()=>{const run=this.get(id);if(!run)throw new Error('Run not found');const result=change(run);this.save(run);return result;});
  }
  list(): Run[] { return this.db.prepare('SELECT data FROM runs ORDER BY created_at DESC, rowid DESC LIMIT 250').all().map(row => JSON.parse(row.data as string)); }
  page(limit = 50, before?: string, query='', filter:'all'|'reference'|'live'|'attention'|'running'='all'): { runs: Run[]; next_cursor: string | null; total: number; matched_total:number } {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('History limit must be from 1 to 100.');
    if(query.length>200||!['all','reference','live','attention','running'].includes(filter))throw new Error('Invalid history search.');
    this.syncSearch();
    const anchor = before ? this.db.prepare('SELECT created_at, rowid AS position FROM runs WHERE id=?').get(before) : undefined;
    if (before && !anchor) throw new Error('History cursor not found.');
    const clauses:string[]=[],params:(string|number)[]=[];
    const normalized=query.trim().toLowerCase();
    if(normalized){clauses.push('instr(s.search_text, ?) > 0');params.push(normalized);}
    if(filter==='reference'||filter==='live'){clauses.push('s.kind=?');params.push(filter);}
    if(filter==='running')clauses.push("s.verdict='running'");
    if(filter==='attention')clauses.push("s.verdict IN ('failed','incomplete','error')");
    const where=clauses.length?` WHERE ${clauses.join(' AND ')}`:'';
    const matched=Number(this.db.prepare(`SELECT COUNT(*) AS total FROM runs r JOIN run_search s ON s.run_id=r.id${where}`).get(...params)!.total);
    if(anchor){clauses.push('(r.created_at, r.rowid) < (?, ?)');params.push(anchor.created_at as string,anchor.position as number);}
    const pagedWhere=clauses.length?` WHERE ${clauses.join(' AND ')}`:'';
    const rows=this.db.prepare(`SELECT r.data FROM runs r JOIN run_search s ON s.run_id=r.id${pagedWhere} ORDER BY r.created_at DESC, r.rowid DESC LIMIT ?`).all(...params,limit+1);
    const runs:Run[]=rows.slice(0,limit).map(row=>JSON.parse(row.data as string));
    return {runs,next_cursor:rows.length>limit?runs.at(-1)!.id:null,total:Number(this.db.prepare('SELECT COUNT(*) AS total FROM runs').get()!.total),matched_total:matched};
  }
  authorize(token: string, run: Run) { this.db.prepare('INSERT INTO capabilities (hash, run_id) VALUES (?, ?)').run(hash(token), run.id); }
  resolve(token: string): Run | undefined { const row = this.db.prepare('SELECT run_id FROM capabilities WHERE hash=?').get(hash(token)); return row ? this.get(row.run_id as string) : undefined; }
  close() { this.db.close(); }
}
