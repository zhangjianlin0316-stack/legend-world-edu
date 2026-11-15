/**
 * 把 data/questions.json 同步成 data/questions.js。
 * 直接双击 index.html 时，浏览器读的是 questions.js。
 * 用法：node tools/sync-questions.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const jsonPath = path.join(root, 'data', 'questions.json');
const raw = fs.readFileSync(jsonPath, 'utf8');
const data = JSON.parse(raw);
if (!data.questions || !Array.isArray(data.questions)) {
  throw new Error('questions.json 里需要有 questions 数组');
}
fs.writeFileSync(path.join(root, 'data', 'questions.js'), 'window.QUESTION_BANK = ' + JSON.stringify(data) + ';\n');
console.log('已同步', data.questions.length, '题到 data/questions.js');
