#!/usr/bin/env node
// migration lint (ENG-341). Fails when a migration adds a NOT NULL column
// without a DEFAULT, or with a volatile default (now(), random()). Those
// read fine in the migration and fail for concurrent writers.

import fs from "node:fs";
import path from "node:path";

const dir = process.argv[2] ?? "migrations";

export function problemsFor(sql, name) {
  const problems = [];
  for (const m of sql.matchAll(/alter table\s+\w+\s+add column\s+(\w+)\s+[^;]*;/gi)) {
    const stmt = m[0];
    const hasDefault = /default\s+([^;]+)/i.exec(stmt);
    if (!/not null/i.test(stmt)) continue;
    if (!hasDefault) {
      problems.push(`${name}: column ${m[1]} is NOT NULL without a DEFAULT`);
    } else if (/now\(\)|random\(\)|clock_timestamp\(\)/i.test(hasDefault[1])) {
      problems.push(`${name}: column ${m[1]} has a volatile DEFAULT`);
    }
  }
  return problems;
}

const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
const problems = files.flatMap((f) => problemsFor(fs.readFileSync(path.join(dir, f), "utf8"), f));
for (const p of problems) console.error(p);
process.exit(problems.length > 0 ? 1 : 0);
