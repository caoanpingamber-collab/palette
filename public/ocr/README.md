# Local OCR assets

The browser uses Tesseract.js7.0.0 and its installed tesseract.js-core LSTM runtimes. `wasm-feature-detect` selects the same plain/SIMD/relaxed-SIMD variant as the upstream worker. Original licenses are included.

`node scripts/compress-ocr.mjs` creates deterministic gzip copies of the three unchanged engines (about3.9MB to1.46MB each). Modern browsers fetch one gzip engine; older browsers retain the original wasm.js fallback. Tests compare every decompressed byte to its original.

Selecting Bottom starts parallel loading of public bootstrap/runtime/engine/language assets. They are cached only in this page's memory and exposed through owned Blob URLs, so each scan avoids another CDN round trip. Failed downloads evict their promise for retry. No uploaded image, recognized text, result or private media is placed in this cache or IndexedDB. A per-image Worker is still terminated after each job; public preloading does not start a Worker or an OCR task. Closing the page releases its public assets.

English data is the upstream fast LSTM model from `naptha/tessdata`, `gh-pages/4.0.0_fast/eng.traineddata.gz` (Apache2.0; see the upstream project). Worker, engine and language model are served from this application's own base path. Uploaded material is not sent to an OCR service. No font/font-size detection is performed.

`controlled-worker.js` is the application's small bootstrap around the unmodified upstream worker. It owns initialization-failure/cancellation cleanup and a26-second startup watchdog, because the upstream createWorker handle is unavailable until initialization finishes. The caller has a25-second overall job timeout and terminates successful workers after recognition.
