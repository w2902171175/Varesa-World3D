Official model source and original terms: [assets/character/SOURCE.md](../assets/character/SOURCE.md).

The actual 瓦雷莎 (Varesa) card, official campaign HTML, original archive, source PMX and original textures are retained in local working copies under `assets/character/`. The public source repository omits those files and the generated embedded model; each builder obtains the original download separately.

The original model was selected after the user requested an appearance faithful to the original, rather than a chibi interpretation. No game extraction tools were used to obtain the character model.

Node smoke validation completed with mocked image decoding (this checks the real model parser, geometry, skeleton and animation calculations; it does not substitute for browser visual verification):

- PMX parsed; 24 material groups and all 328 bones created.
- Embedded texture names resolve to the original files, including GBK ZIP filenames and Unicode PMX texture paths.
- Idle, walking, running, jumping, coffee, umbrella and riding each evaluated for 90 frames with no non-finite bone matrices.
- Six scene-relevant facial morphs retained for GPU upload; source archive remains unmodified.
- Coffee right-hand socket settles near `[-0.070, 1.402, 0.126]` metres; umbrella grip near `[-0.174, 1.123, 0.198]` metres.
- `node --check src/character.js` passed.
