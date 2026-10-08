// Checks the translation files: npm run check-i18n
//
// - each language has the same keys as English, none of them empty;
// - every key the code names as a plain string ('Save' | translate, translate.instant('Save'), …) is in the English
//   files. Keys built at run time, such as 'action.' + action, cannot be checked here.
//
// Exits with 1 and a list of what is wrong, so CI can run it.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

/** Translation folders, each with en.json and the other languages; the app loads them merged */
const FOLDERS = ['src/assets/i18n', 'src/app/user-management/i18n'];
const SOURCE = 'src/app';
/**
 * How the code names a key: the pipe in templates, instant() and stream() in TypeScript. One pattern covers both
 * kinds of quote, so the apostrophe in "don't" is never taken for the start of another key.
 */
const USES = [
  /(['"])((?:(?!\1)[^\\]|\\.)+)\1\s*\|\s*translate\b/g,
  /\.(?:instant|stream)\(\s*(['"])((?:(?!\1)[^\\]|\\.)+)\1/g,
];

const problems = [];
const english = new Map();

for (const folder of FOLDERS) {
  const files = readdirSync(folder).filter(name => name.endsWith('.json'));
  const read = name => JSON.parse(readFileSync(join(folder, name), 'utf8'));
  const en = read('en.json');
  for (const [key, value] of Object.entries(en)) {
    english.set(key, value);
  }
  for (const name of files) {
    const other = read(name);
    for (const key of Object.keys(en)) {
      if (!(key in other)) {
        problems.push(`${folder}/${name}: missing "${key}"`);
      } else if (typeof other[key] !== 'string' || !other[key].trim()) {
        problems.push(`${folder}/${name}: empty "${key}"`);
      }
    }
    for (const key of Object.keys(other).filter(key => !(key in en))) {
      problems.push(`${folder}/${name}: "${key}" is not in en.json`);
    }
  }
}

function* sourceFiles(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* sourceFiles(path);
    } else if (/\.(ts|html)$/.test(entry.name) && !entry.name.endsWith('.spec.ts')) {
      yield path;
    }
  }
}

for (const file of sourceFiles(SOURCE)) {
  // In a component's inline template, \\' in the TypeScript source is the template's escaped quote \'
  const text = readFileSync(file, 'utf8').replaceAll("\\\\'", "\\'");
  for (const pattern of USES) {
    for (const [, , raw] of text.matchAll(pattern)) {
      const key = raw.replace(/\\(.)/g, '$1');
      if (!english.has(key)) {
        problems.push(`${relative('.', file).replaceAll('\\', '/')}: "${key}" has no translation`);
      }
    }
  }
}

if (problems.length) {
  console.error([...new Set(problems)].join('\n'));
  console.error(`\n${problems.length} translation problem(s)`);
  process.exit(1);
}
console.log(`Translations OK: ${english.size} keys in ${FOLDERS.length} folders`);
