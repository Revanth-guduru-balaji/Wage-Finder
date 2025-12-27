import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { parse } from 'csv-parse/sync';
import JSZip from 'jszip';

const DATA_DIR = path.join(process.cwd(), 'public', 'data');

async function processZipFile(zipPath, yearLabel) {
  console.log(`Processing ${zipPath}...`);

  const zipBuffer = fs.readFileSync(zipPath);
  const zip = await JSZip.loadAsync(zipBuffer);

  const filenames = Object.keys(zip.files);

  // Helper to find and parse CSV
  const findAndParseCSV = async (patterns) => {
    for (const pattern of patterns) {
      const found = filenames.find(f => f.toLowerCase().includes(pattern) && f.endsWith('.csv'));
      if (found) {
        const content = await zip.files[found].async('string');
        return parse(content, {
          columns: true,
          skip_empty_lines: true,
          relax_quotes: true,
          relax_column_count: true,
          skip_records_with_error: true,
        });
      }
    }
    return null;
  };

  // Load lookup tables
  const geoData = await findAndParseCSV(['geography']);
  const socData = await findAndParseCSV(['oes_soc_occs', 'soc_occ']);
  const wageData = await findAndParseCSV(['alc_export', 'edc_export']);

  if (!wageData) {
    console.error('Could not find wage data file');
    return null;
  }

  // Build lookup maps
  const areaMap = new Map();
  if (geoData) {
    geoData.forEach(row => {
      const code = row.Area || row.area;
      const name = row.AreaName || row.areaname;
      if (code && name) areaMap.set(code.trim(), name.trim());
    });
  }

  const socMap = new Map();
  if (socData) {
    socData.forEach(row => {
      const code = row.soccode || row.SocCode;
      const title = row.Title || row.title;
      if (code && title) socMap.set(code.trim(), title.trim());
    });
  }

  console.log(`  Areas: ${areaMap.size}, Occupations: ${socMap.size}`);

  // Process wage data
  const parseWage = (val) => {
    const num = parseFloat(String(val || '0').replace(/[$,]/g, '')) || 0;
    return num < 500 ? Math.round(num * 2080) : Math.round(num);
  };

  const processed = [];
  const seenOccupations = new Map();
  const seenAreas = new Set();

  for (const row of wageData) {
    const areaCode = (row.Area || '').trim();
    const socCode = (row.SocCode || row.soccode || '').trim();
    const level2 = parseWage(row.Level2);

    if (!socCode || !areaCode || level2 <= 0) continue;

    const areaName = areaMap.get(areaCode) || areaCode;
    const socTitle = socMap.get(socCode) || socCode;

    processed.push({
      s: socCode,          // SOC code
      a: areaCode,         // Area code
      n: areaName,         // Area name
      l1: parseWage(row.Level1),
      l2: level2,
      l3: parseWage(row.Level3),
      l4: parseWage(row.Level4),
    });

    if (!seenOccupations.has(socCode)) {
      seenOccupations.set(socCode, socTitle);
    }
    seenAreas.add(areaName);
  }

  // Build compact output with indexed references to reduce size
  const areasArray = Array.from(seenAreas).sort();
  const areaToIndex = new Map(areasArray.map((name, i) => [name, i]));

  // Convert wages to use area index instead of name (saves ~30% file size)
  const compactWages = processed.map(w => ({
    s: w.s,           // SOC code
    a: areaToIndex.get(w.n), // Area index (number instead of string)
    l1: w.l1,
    l2: w.l2,
    l3: w.l3,
    l4: w.l4,
  }));

  const output = {
    year: yearLabel,
    occupations: Array.from(seenOccupations.entries()).map(([code, title]) => ({ c: code, t: title })).sort((a, b) => a.t.localeCompare(b.t)),
    areas: areasArray,
    wages: compactWages,
  };

  console.log(`  Processed: ${compactWages.length} wage records, ${output.occupations.length} occupations, ${output.areas.length} areas`);

  return output;
}

async function main() {
  // Ensure output directory exists
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  // Find all OFLC zip files
  const files = fs.readdirSync(process.cwd()).filter(f => f.startsWith('OFLC') && f.endsWith('.zip'));

  if (files.length === 0) {
    console.log('No OFLC zip files found. Looking for extracted folders...');
    const folders = fs.readdirSync(process.cwd()).filter(f => f.startsWith('OFLC') && fs.statSync(f).isDirectory());
    console.log('Found folders:', folders);
    return;
  }

  const manifest = { years: [] };

  for (const file of files) {
    // Extract year from filename like "OFLC_Wages_2025-26.zip"
    const match = file.match(/(\d{4}-\d{2})/);
    const yearLabel = match ? match[1] : file.replace('.zip', '');

    const data = await processZipFile(path.join(process.cwd(), file), yearLabel);
    if (data) {
      const outputFile = `wages-${yearLabel}.bin`;
      const jsonStr = JSON.stringify(data);
      const compressed = zlib.gzipSync(jsonStr);
      fs.writeFileSync(path.join(DATA_DIR, outputFile), compressed);
      manifest.years.push({ label: yearLabel, file: outputFile });
      const ratio = ((1 - compressed.length / jsonStr.length) * 100).toFixed(1);
      console.log(`  Written: ${outputFile} (${(compressed.length / 1024 / 1024).toFixed(1)}MB, ${ratio}% smaller)`);
    }
  }

  // Write manifest
  fs.writeFileSync(path.join(DATA_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log('\nManifest written. Done!');
}

main().catch(console.error);
