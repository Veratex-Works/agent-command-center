/**
 * Writes a minimal valid PDF to public/openclaw-test-download.pdf (no npm deps).
 * Run: node scripts/build-test-pdf.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const outDir = join(__dirname, '../public')
const outPath = join(outDir, 'openclaw-test-download.pdf')

const stream = 'BT /F1 18 Tf 72 720 Td (OpenClaw chat PDF download test.) Tj ET'
const streamBytes = Buffer.byteLength(stream, 'utf8')

const objects = [
  '1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n',
  '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n',
  '3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n',
  `4 0 obj<</Length ${streamBytes}>>stream\n${stream}\nendstream\nendobj\n`,
  '5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\n',
]

const header = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n'
let body = header
const xrefOffsets = [0]

for (let i = 0; i < objects.length; i++) {
  xrefOffsets.push(Buffer.byteLength(body, 'binary'))
  body += objects[i]
}

const xrefStart = Buffer.byteLength(body, 'binary')
let xref = 'xref\n0 6\n0000000000 65535 f \n'
for (let i = 1; i <= 5; i++) {
  xref += `${String(xrefOffsets[i]).padStart(10, '0')} 00000 n \n`
}
xref += 'trailer<< /Size 6 /Root 1 0 R >>\n'
xref += `startxref\n${xrefStart}\n%%EOF\n`

const pdf = body + xref
mkdirSync(outDir, { recursive: true })
writeFileSync(outPath, pdf, 'binary')
console.log('Wrote', outPath, pdf.length, 'bytes')

const txtPath = join(outDir, 'test_download.txt')
writeFileSync(txtPath, 'OpenClaw outbound plain-text file test.\n', 'utf8')
console.log('Wrote', txtPath)
