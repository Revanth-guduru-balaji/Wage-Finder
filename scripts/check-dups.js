import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pako = require('pako');
import fs from 'fs';

const data = JSON.parse(pako.ungzip(fs.readFileSync('public/data/wages-2025-26.bin'), { to: 'string' }));

// Check for Data Warehousing
const dw = data.occupations.filter(o => o.t.toLowerCase().includes('data warehousing'));
console.log('Data Warehousing entries:', dw.length);
dw.forEach(o => console.log('  ', o.o || o.c, '-', o.t));

// Check for Clinical Data
const cd = data.occupations.filter(o => o.t.toLowerCase().includes('clinical data'));
console.log('\nClinical Data entries:', cd.length);
cd.forEach(o => console.log('  ', o.o || o.c, '-', o.t));

// Check for any duplicates by O*NET code or title
const codes = data.occupations.map(o => o.o || `${o.c}|${o.t}`);
const dupCodes = codes.filter((c, i) => codes.indexOf(c) !== i);
console.log('\nDuplicate codes found:', [...new Set(dupCodes)].length);

// Check for duplicate titles
const titleMap = new Map();
data.occupations.forEach(o => {
  if (!titleMap.has(o.t)) {
    titleMap.set(o.t, []);
  }
  titleMap.get(o.t).push(o.o || o.c);
});

const dupTitles = [...titleMap.entries()].filter(([t, codes]) => codes.length > 1);
console.log('Titles appearing multiple times:', dupTitles.length);
if (dupTitles.length > 0) {
  console.log('Examples:');
  dupTitles.slice(0, 5).forEach(([t, codes]) => {
    console.log(`  "${t}" appears with codes: ${codes.join(', ')}`);
  });
}
