const uuid = '[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}'
const archivePrefix = new RegExp(`^banner-history/${uuid}/${uuid}/$`)

export async function removeArchivePrefix(client, prefix) {
  if (typeof prefix !== 'string' || !archivePrefix.test(prefix)) throw new Error('Refusing to clean an unrelated object prefix')
  // Archive members are fixed; provider listings are not a deletion authority.
  await removeVerified(client, ['original', 'first', 'last', 'thumbnail'].map(name => prefix + name))
}

export async function removeVerified(client, paths) {
  if (typeof client.remove !== 'function' || typeof client.getFileMetadata !== 'function') throw new Error('Private object deletion adapter is missing')
  if (!paths.every(value => /^banner-history\/[a-f0-9-]{36}\/[a-f0-9-]{36}\/(original|first|last|thumbnail)$/.test(value))) throw new Error('Refusing unrelated object deletion')
  for (const filePath of paths) {
    try { await client.remove([filePath]) }
    catch (error) {
      // A lost response is successful only when the provider confirms absence.
      if (await client.getFileMetadata(filePath) !== null) throw error
    }
  }
}
