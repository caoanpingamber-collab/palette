/* Own initialization cleanup: Tesseract exposes its handle only after initialization. */
const token = new URLSearchParams(self.location.search).get('job')
const channel = new BroadcastChannel(`bottom-ocr-${token}`)
const watchdog = setTimeout(() => self.close(), 26000)
channel.onmessage = event => { if (event.data === 'close') self.close() }
const forward = self.postMessage.bind(self)
self.postMessage = (message, ...args) => {
  forward(message, ...args)
  if (message?.action === 'initialize' && message?.status === 'resolve') clearTimeout(watchdog)
  if (message?.status === 'reject') { clearTimeout(watchdog); setTimeout(() => self.close(), 0) }
}
importScripts('./worker.min.js')
