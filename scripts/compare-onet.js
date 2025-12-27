import JSZip from 'jszip';
import fs from 'fs';
import { parse } from 'csv-parse/sync';

async function getOnetData(zipPath) {
  const zip = await JSZip.loadAsync(fs.readFileSync(zipPath));
  const files = Object.keys(zip.files);
  const onetFile = files.find(f => f.toLowerCase().includes('onet_occs') && f.endsWith('.csv'));
  if (!onetFile) return null;

  const content = await zip.files[onetFile].async('string');
  const data = parse(content, { columns: true, skip_empty_lines: true });
  return data;
}

async function compare() {
  const onet2023 = await getOnetData('OFLC_Wages_2023-24.zip');
  const onet2024 = await getOnetData('OFLC_Wages_2024-25.zip');

  console.log('2023-24 O*NET codes:', onet2023?.length || 0);
  console.log('2024-25 O*NET codes:', onet2024?.length || 0);

  if (onet2023 && onet2024) {
    // Check if 15-1243.01 exists in both
    const code2023 = onet2023.find(r => r.OnetCode === '15-1243.01');
    const code2024 = onet2024.find(r => r.OnetCode === '15-1243.01');

    console.log('\n15-1243.01 in 2023-24:', code2023);
    console.log('15-1243.01 in 2024-25:', code2024);

    // Compare titles - are they the same?
    if (code2023 && code2024) {
      console.log('\nTitles match:', code2023.OnetTitle === code2024.OnetTitle);
    }

    // Check how many codes are identical
    const codes2023 = new Set(onet2023.map(r => r.OnetCode));
    const codes2024 = new Set(onet2024.map(r => r.OnetCode));

    const common = [...codes2023].filter(c => codes2024.has(c));
    const only2023 = [...codes2023].filter(c => !codes2024.has(c));
    const only2024 = [...codes2024].filter(c => !codes2023.has(c));

    console.log('\nCommon codes:', common.length);
    console.log('Only in 2023-24:', only2023.length);
    console.log('Only in 2024-25:', only2024.length);

    if (only2023.length > 0) {
      console.log('\nRemoved in 2024-25 (sample):', only2023.slice(0, 5));
    }
    if (only2024.length > 0) {
      console.log('\nNew in 2024-25 (sample):', only2024.slice(0, 5));
    }
  }
}

compare();
