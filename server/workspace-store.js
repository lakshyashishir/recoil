import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'

function parseWorkspace(text, source) {
  try {
    const payload = JSON.parse(text)
    if (!payload || typeof payload !== 'object') throw new Error('workspace root is not an object')
    return payload
  } catch (error) {
    throw new Error(`Recoil workspace from ${source} is invalid: ${error.message}`)
  }
}

export class WorkspaceStore {
  constructor({ file, enabled = true, bucket, key, region, client } = {}) {
    this.file = resolve(file || '.recoil-data/workspace.json')
    this.enabled = enabled
    this.bucket = bucket || null
    this.key = key || 'recoil/workspace.json'
    this.region = region || process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1'
    this.client = client || null
    this.remoteQueue = Promise.resolve()
    this.localStatus = enabled ? 'not_loaded' : 'disabled'
    this.remoteStatus = this.bucket ? 'not_loaded' : 'disabled'
    this.remoteError = null
    this.remoteUpdatedAt = null
  }

  loadLocal() {
    if (!this.enabled || !existsSync(this.file)) return null
    try {
      const payload = parseWorkspace(readFileSync(this.file, 'utf8'), this.file)
      this.localStatus = 'ready'
      return payload
    } catch (error) {
      this.localStatus = 'failed'
      console.warn(error.message)
      return null
    }
  }

  async loadRemote() {
    if (!this.enabled || !this.bucket) return null
    try {
      const result = await this.s3().send(new GetObjectCommand({ Bucket: this.bucket, Key: this.key }))
      const body = await result.Body?.transformToString()
      if (!body) throw new Error('workspace object was empty')
      const payload = parseWorkspace(body, `s3://${this.bucket}/${this.key}`)
      this.writeLocal(payload)
      this.remoteStatus = 'ready'
      this.remoteError = null
      this.remoteUpdatedAt = result.LastModified?.toISOString?.() || payload.updatedAt || null
      return payload
    } catch (error) {
      if (error?.name === 'NoSuchKey' || error?.name === 'NotFound' || error?.$metadata?.httpStatusCode === 404) {
        this.remoteStatus = 'empty'
        this.remoteError = null
        return null
      }
      this.remoteStatus = 'failed'
      this.remoteError = error.message
      throw error
    }
  }

  save(payload) {
    if (!this.enabled) return
    this.writeLocal(payload)
    if (!this.bucket) return
    const body = JSON.stringify(payload, null, 2)
    this.remoteStatus = 'saving'
    this.remoteQueue = this.remoteQueue
      .catch(() => undefined)
      .then(async () => {
        await this.s3().send(new PutObjectCommand({
          Bucket: this.bucket,
          Key: this.key,
          Body: body,
          ContentType: 'application/json',
          ServerSideEncryption: 'AES256',
        }))
        this.remoteStatus = 'ready'
        this.remoteError = null
        this.remoteUpdatedAt = payload.updatedAt || new Date().toISOString()
      })
      .catch((error) => {
        this.remoteStatus = 'failed'
        this.remoteError = error.message
        console.warn(`Recoil workspace could not be saved to S3: ${error.message}`)
      })
  }

  status() {
    return {
      mode: this.bucket ? 's3' : 'local',
      durable: Boolean(this.bucket),
      status: this.bucket ? this.remoteStatus : this.localStatus,
      updatedAt: this.remoteUpdatedAt,
      error: this.remoteError,
    }
  }

  async flush() {
    await this.remoteQueue
    if (this.bucket && this.remoteStatus === 'failed') {
      throw new Error(this.remoteError || 'workspace object could not be saved')
    }
  }

  writeLocal(payload) {
    mkdirSync(dirname(this.file), { recursive: true })
    const temporary = `${this.file}.tmp`
    writeFileSync(temporary, JSON.stringify(payload, null, 2))
    renameSync(temporary, this.file)
    this.localStatus = 'ready'
  }

  s3() {
    if (!this.client) this.client = new S3Client({ region: this.region })
    return this.client
  }
}

export function createWorkspaceStore(options = {}) {
  return new WorkspaceStore(options)
}
