import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  csvToRows, parseHaveQty, rowsToItems, manifestKey,
  safeImageUrl, sortItems, exportCsv,
} = require('../../public/lib.js');

test('CSV parser handles quoted commas and quantities', () => {
  const rows = csvToRows('Group,Card,Number,Have\nFury,"Hero, Bold",001/166,2\n');
  assert.equal(rows[1][1], 'Hero, Bold');
  assert.equal(parseHaveQty(rows[1][3]), 2);
});

test('sheet rows map into tracker items', () => {
  const rows = csvToRows('Group,Card,Number,Variant / Stamp,Have,Image\nFury,Test,001/166,Regular,1,https://example.com/a.webp');
  const items = rowsToItems(rows);
  assert.equal(items.length, 1);
  assert.equal(items[0].qty, 1);
  assert.equal(manifestKey(items[0].card,items[0].num,items[0].variant),'test|001 166|regular');
});

test('image URL safety and sorting work', () => {
  assert.equal(safeImageUrl('javascript:alert(1)','https://example.com/'), '');
  assert.equal(sortItems([{card:'Zed',num:'2'},{card:'Ahri',num:'10'}],'name')[0].card,'Ahri');
});

test('CSV exports owned quantity', () => {
  const text=exportCsv('owned',[{card:'Ahri',num:'1',variant:'Regular',group:'Mind',price:'',qty:2}]);
  assert.match(text,/Have/);
  assert.match(text,/Ahri,1,Regular,Mind,,2/);
});
