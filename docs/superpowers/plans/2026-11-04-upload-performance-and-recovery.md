# Upload Performance and Cloud Recovery

- [x] Measure Header and Bottom, first and repeated upload, locally and on the real published page. Use synthetic data, block archival and record Worker stages/public network bytes.
- [x] Confirm real OCR is about100ms; old published Bottom takes8.8s/6.3s from repeated sequential CDN loading, with one25s timeout. Header is about0.3s.
- [x] Warm public OCR assets only when Bottom is selected, fetch in parallel, gzip the unchanged chosen SIMD engine, and retain only public Blob resources in page memory. Keep no private input cache, no idle Worker, unchanged OCR/rules and25s deadline.
- [x] Regress exact text/evidence, one public download across scans, Worker cleanup, failed-load/HTML-response retry, gzip-less fallback, redirects and byte-identical compressed engines. Integrated local suite:88 unit/API,39 browser tests; the original user PNG still reads44 characters/two lines locally without cloud upload.
- [x] With separate user approval, replace unsafe-to-trust prefix listings with bounded exact-member cleanup. Preserve deletion/metadata guards, real records and credentials. Canonical source71a30a9; native5a19a4f; release7704278469279042585 finished; live health200 and synthetic API checks passed.
- [x] Publish the optimized clean frontend to the existing static app and push the integrated source to GitHub. Source d084ed7, artifact bottom-d084ed7;68files,13.6MB compressed archive. Both official and existing alias serve the expected version.
- [x] Re-measure the actual published cold/repeated upload with successful OCR, then verify GIF/results/export/cloud history/admin and cleanup. Header0.30/0.24s; Bottom5.80/0.79s with successful22-character checks and zero OCR requests on the second scan. Independent full browser cloud/admin/GIF/download/logout regression passed; PNG44characters/two lines/confidence95. Synthetic records/sessions cleaned.
- [x] Update delivery with measured outcomes, final revisions and residual boundaries. First-use download remains network/device-dependent; benchmark timing excludes asynchronous archival. No promise of fixed subsecond cold startup.

The original uncompressed engines remain for compatibility. Public cache is bounded to one device-appropriate engine/runtime/model/bootstrap per page; user images and recognized copy are never persisted by it. A failed download can be retried; no new provider, resource, paid plan or UI is introduced.

Implementation follows installed Tesseract7 source behavior. The [upstream performance guide](https://github.com/naptha/tesseract.js/blob/master/docs/performance.md) confirms setup/cache cost can dominate; this app caches only public assets instead of retaining a private-image Worker between jobs.
