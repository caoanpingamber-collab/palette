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
