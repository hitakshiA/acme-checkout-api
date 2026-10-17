#!/usr/bin/env node
// migration lint (ENG-341). Fails when a migration adds a NOT NULL column
// without a DEFAULT -- the shape of the 2026-10-14 incident.

import fs from "node:fs";
import path from "node:path";

const dir = process.argv[2] ?? "migrations";

export function problemsFor(sql, name) {
  const problems = [];
  for (const m of sql.matchAll(/alter table\s+\w+\s+add column\s+(\w+)\s+[^;]*;/gi)) {
    const stmt = m[0];
    if (/not null/i.test(stmt) && !/default\s+/i.test(stmt)) {
      problems.push(`${name}: column ${m[1]} is NOT NULL without a DEFAULT`);
    }
  }
  return problems;
}

const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
const problems = files.flatMap((f) => problemsFor(fs.readFileSync(path.join(dir, f), "utf8"), f));
for (const p of problems) console.error(p);
process.exit(problems.length > 0 ? 1 : 0);
