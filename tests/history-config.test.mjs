import test from 'node:test'
import assert from 'node:assert/strict'
import { configuration, root } from '../server/config.mjs'
import { mkdtempSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

test('archive storage stays disabled until explicitly configured', () => {
  const previous = process.env.HISTORY_ARCHIVE_ENABLED
  try {
    delete process.env.HISTORY_ARCHIVE_ENABLED
    assert.equal(configuration().archiveEnabled, false)
    process.env.HISTORY_ARCHIVE_ENABLED = 'true'
    assert.equal(configuration().archiveEnabled, true)
  } finally { if (previous === undefined) delete process.env.HISTORY_ARCHIVE_ENABLED; else process.env.HISTORY_ARCHIVE_ENABLED = previous }
})

test('private storage cannot be placed in a publicly served or unprotected project directory', () => {
  const previous = process.env.HISTORY_DATA_DIR
  try {
    for (const dir of ['public/history', 'dist/data', 'src/files', '.', '.custom-history']) {
      process.env.HISTORY_DATA_DIR = dir
      assert.throws(() => configuration(), /private|私有/)
    }
    process.env.HISTORY_DATA_DIR = '.history-data'
    assert.match(configuration().dir, /\.history-data$/)
  } finally { if (previous === undefined) delete process.env.HISTORY_DATA_DIR; else process.env.HISTORY_DATA_DIR = previous }
})

test('a symlink cannot disguise a public project directory as private external storage', () => {
  const previous = process.env.HISTORY_DATA_DIR
  const dir = mkdtempSync(path.join(tmpdir(), 'banner-config-link-'))
  try {
    symlinkSync(path.join(root, 'public'), path.join(dir, 'public-link'))
    process.env.HISTORY_DATA_DIR = path.join(dir, 'public-link', 'history')
    assert.throws(() => configuration(), /private|私有/)
  } finally { if (previous === undefined) delete process.env.HISTORY_DATA_DIR; else process.env.HISTORY_DATA_DIR = previous; rmSync(dir, { recursive: true, force: true }) }
})

test('development-only Miaoda credentials are refused by production configuration', () => {
  const previous = { NODE_ENV: process.env.NODE_ENV, HISTORY_STORAGE: process.env.HISTORY_STORAGE, HISTORY_ALLOWED_ORIGINS: process.env.HISTORY_ALLOWED_ORIGINS }
  try {
    process.env.NODE_ENV = 'production'
    process.env.HISTORY_STORAGE = 'miaoda'
    process.env.HISTORY_ALLOWED_ORIGINS = 'https://example.test'
    assert.throws(() => configuration(), /development credentials|production/)
  } finally { for (const [key, value] of Object.entries(previous)) if (value === undefined) delete process.env[key]; else process.env[key] = value }
})

test('the HTTP development cloud proxy cannot bind to a public network interface', () => {
  const previous = { HISTORY_STORAGE: process.env.HISTORY_STORAGE, HISTORY_HOST: process.env.HISTORY_HOST }
  try {
    process.env.HISTORY_STORAGE = 'miaoda-remote'
    process.env.HISTORY_HOST = '0.0.0.0'
    assert.throws(() => configuration(), /loopback/)
  } finally { for (const [key, value] of Object.entries(previous)) if (value === undefined) delete process.env[key]; else process.env[key] = value }
})
