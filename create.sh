rm -rf dist
mkdir -p dist/task
cp -r task/* dist/task/
tfx extension create --manifest-globs vss-extension.json
tfx extension publish --manifest-globs vss-extension.json