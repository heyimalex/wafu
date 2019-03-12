#!/bin/bash -e

echo 'Clearing wafu_pkg/dist...'
rm -rf wafu_pkg/dist

echo 'Building rust code...'
(cd wafu_rs && wasm-pack build)

echo 'Building typescript code...'
(cd wafu_pkg && npm run build)

echo 'Copying rust build artifacts to dist...'
find ./wafu_rs/pkg -type f \( -iname '*.js' -o -iname '*.ts' -o -iname '*.wasm' \) \
  -print -exec cp {} wafu_pkg/dist \;

echo 'Linking into wafu_demo...'
(cd wafu_demo && npm link --only=production ../wafu_pkg)

echo 'Done!'
