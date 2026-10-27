rm -rf dist
mkdir -p dist/task
cp -r task/* dist/task/
npx tfx extension create --manifest-globs vss-extension.json
npx tfx extension publish --manifest-globs vss-extension.json