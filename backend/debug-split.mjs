import { readFileSync } from 'fs';
const raw = readFileSync('d:/projects/HTM/FM_Repo_rep/backend/sql/migrations/2026-02-26-logsheet-workorders.sql', 'utf8');

function normalizeSql(sql) {
  let s = sql;
  s = s.replace(/\bADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\b/gi, 'ADD COLUMN');
  return s;
}

function splitStatements(sql) {
  const stmts = [];
  let current = "";
  let delimiter = ";";
  const lines = sql.split(/\r?\n/);
  for (const line of lines) {
    const delimMatch = /^\s*DELIMITER\s+(\S+)/i.exec(line);
    if (delimMatch) {
      if (current.trim()) { stmts.push(current.trim()); current = ""; }
      delimiter = delimMatch[1];
      continue;
    }
    if (line.trimEnd().endsWith(delimiter)) {
      current += line.slice(0, line.lastIndexOf(delimiter)) + "\n";
      if (current.trim()) stmts.push(current.trim());
      current = "";
    } else {
      current += line + "\n";
    }
  }
  if (current.trim()) stmts.push(current.trim());
  return stmts.filter(s => s.length > 0 && !/^--/.test(s));
}

const n = normalizeSql(raw);
const stmts = splitStatements(n);
console.log('Count:', stmts.length);
stmts.forEach((s, i) => console.log(i + ':', JSON.stringify(s.slice(0, 100))));
