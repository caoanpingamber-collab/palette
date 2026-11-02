export async function createStore(config) {
  if (config.storage === 'miaoda-remote') throw new Error('The deployed backend owns storage; do not instantiate a local archive provider')
  if (config.storage !== 'miaoda') {
    const { HistoryStore } = await import('./store.mjs')
    return new HistoryStore(config)
  }
  const { MiaodaSql, miaodaObjects } = await import('./miaoda-client.mjs')
  const { MiaodaRepository } = await import('./miaoda-repository.mjs')
  const { CloudHistoryStore } = await import('./cloud-store.mjs')
  const repository = new MiaodaRepository(new MiaodaSql(config.miaoda))
  const objects = await miaodaObjects(config.miaoda)
  await repository.initialize()
  const store = new CloudHistoryStore({ repository, objects, maxBytes: config.maxBytes })
  await store.recover()
  return store
}
