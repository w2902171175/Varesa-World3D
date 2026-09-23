# 瓦雷莎 / Varesa — official model provenance

Retrieved 2026-09-12 for this local personal scene.

- Official Genshin 5.5 creator campaign: https://www.bilibili.com/blackboard/era/8LW2lXMlJ7LhJS4D.html
- The first “模型下载” card is visibly labelled “瓦雷莎”. Its original image is preserved as `official-reference.png`.
- Model archive linked directly by that campaign: https://activity.hdslb.com/blackboard/static/20250317/c6e19b806b80786dbd92b712c3f459cf/HZToqOXWsk.zip
- Archive SHA-256: `2089B4691B576CA5C7F4D83D990600CFB05653D34066DF50DAD393BE96A1302E`.
- Original model provider: **miHoYo**. MMD adaptation: **观海** (Bilibili 观海子).
- The original archive and its `readme【一定要看】.txt` are retained in local working copies only and excluded from the public source repository. The ZIP uses GBK filenames; the readme itself is UTF-8.

The original readme permits physics/weight/expression bug fixes and moderate material/appearance adjustments. It prohibits commercial use, secondary redistribution of the model, and removal of parts for unrelated model modifications. Preserve these terms and credits; do not publicly redistribute the model archive or publish this locally embedded copy as a model download.

The local scene uses the complete original Varesa mesh and original texture artwork. Runtime changes are uniform metre scaling, a smaller set of facial morph buffers, standard Three.js material rendering, retargeted CMU 35_01 / 35_17 walking and running cycles, and authored jumping/interaction layers on the existing skeleton. See `../motion/SOURCE.md` for motion provenance and acknowledgment. The official model archive contains no animation clips; the included motion is not extracted from Genshin Impact.

Technical: 34,917 vertices, 43,244 triangles, 24 material groups, 328 bones, 66 source face morphs. PMX 2.0 parses using the bundled Three.js 0.170 MMD parser/loader. PMX and texture bytes are embedded in `embedded.js` by `prepare-assets.mjs`, so the playable HTML needs no network or local asset fetch.
