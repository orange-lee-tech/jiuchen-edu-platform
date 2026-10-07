import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

test('Tencent document parser request does not send an open-ended PageRange guess', async () => {
  const source = await readFile(new URL('./material-document-extractor.ts', import.meta.url), 'utf8')
  assert.equal(source.includes("body.PageRange = '1-'"), false)
  assert.match(source, /FileUrl:\s*fileUrl/)
  assert.match(source, /FileType:\s*fileType/)
})

test('Tencent document parser diagnostics retain provider RequestId for InternalError triage', async () => {
  const source = await readFile(new URL('./material-document-extractor.ts', import.meta.url), 'utf8')
  assert.match(source, /raw\.Response\?\.RequestId/)
  assert.match(source, /material_document_parser_failed:/)
})
