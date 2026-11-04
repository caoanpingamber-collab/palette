# Local OCR assets

The browser uses Tesseract.js7.0.0 and its installed tesseract.js-core LSTM runtimes. The three self-contained wasm.js variants allow the upstream worker to select plain/SIMD/relaxed-SIMD without external requests. Only one is loaded per job. Original licenses are included.

English data is the upstream fast LSTM model from `naptha/tessdata`, `gh-pages/4.0.0_fast/eng.traineddata.gz` (Apache2.0; see the upstream project). Worker, engine and language model are served from this application's own base path. Uploaded material is not sent to an OCR service. No font/font-size detection is performed.

`controlled-worker.js` is the application's small bootstrap around the unmodified upstream worker. It owns initialization-failure/cancellation cleanup and a26-second startup watchdog, because the upstream createWorker handle is unavailable until initialization finishes. The caller has a25-second overall job timeout and terminates successful workers after recognition.
