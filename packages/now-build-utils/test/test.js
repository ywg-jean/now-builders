/* global beforeAll, expect, it, jest */
const path = require('path');
const fs = require('fs-extra');
// eslint-disable-next-line import/no-extraneous-dependencies
const execa = require('execa');
const assert = require('assert');
const { glob, download } = require('../');
const { createZip } = require('../dist/lambda');
const {
  getSupportedNodeVersion,
  defaultSelection,
} = require('../dist/fs/node-version');

const {
  packAndDeploy,
  testDeployment,
} = require('../../../test/lib/deployment/test-deployment.js');

jest.setTimeout(4 * 60 * 1000);
const builderUrl = '@canary';
let buildUtilsUrl;

beforeAll(async () => {
  const buildUtilsPath = path.resolve(__dirname, '..');
  buildUtilsUrl = await packAndDeploy(buildUtilsPath);
  console.log('buildUtilsUrl', buildUtilsUrl);
});

// unit tests

it('should re-create symlinks properly', async () => {
  const files = await glob('**', path.join(__dirname, 'symlinks'));
  assert.equal(Object.keys(files).length, 2);

  const outDir = path.join(__dirname, 'symlinks-out');
  await fs.remove(outDir);

  const files2 = await download(files, outDir);
  assert.equal(Object.keys(files2).length, 2);

  const [linkStat, aStat] = await Promise.all([
    fs.lstat(path.join(outDir, 'link.txt')),
    fs.lstat(path.join(outDir, 'a.txt')),
  ]);
  assert(linkStat.isSymbolicLink());
  assert(aStat.isFile());
});

it('should create zip files with symlinks properly', async () => {
  const files = await glob('**', path.join(__dirname, 'symlinks'));
  assert.equal(Object.keys(files).length, 2);

  const outFile = path.join(__dirname, 'symlinks.zip');
  await fs.remove(outFile);

  const outDir = path.join(__dirname, 'symlinks-out');
  await fs.remove(outDir);
  await fs.mkdirp(outDir);

  await fs.writeFile(outFile, await createZip(files));
  await execa('unzip', [outFile], { cwd: outDir });

  const [linkStat, aStat] = await Promise.all([
    fs.lstat(path.join(outDir, 'link.txt')),
    fs.lstat(path.join(outDir, 'a.txt')),
  ]);
  assert(linkStat.isSymbolicLink());
  assert(aStat.isFile());
});

it('should only match supported node versions', () => {
  expect(getSupportedNodeVersion('10.x')).resolves.toHaveProperty('major', 10);
  expect(getSupportedNodeVersion('8.10.x')).resolves.toHaveProperty('major', 8);
  expect(getSupportedNodeVersion('8.11.x')).rejects.toThrow();
  expect(getSupportedNodeVersion('6.x')).rejects.toThrow();
  expect(getSupportedNodeVersion('999.x')).rejects.toThrow();
  expect(getSupportedNodeVersion('foo')).rejects.toThrow();
  expect(getSupportedNodeVersion('')).resolves.toBe(defaultSelection);
  expect(getSupportedNodeVersion(null)).resolves.toBe(defaultSelection);
  expect(getSupportedNodeVersion(undefined)).resolves.toBe(defaultSelection);
});

it('should match all semver ranges', () => {
  // See https://docs.npmjs.com/files/package.json#engines
  expect(getSupportedNodeVersion('10.0.0')).resolves.toHaveProperty(
    'major',
    10,
  );
  expect(getSupportedNodeVersion('10.x')).resolves.toHaveProperty('major', 10);
  expect(getSupportedNodeVersion('>=10')).resolves.toHaveProperty('major', 10);
  expect(getSupportedNodeVersion('>=10.3.0')).resolves.toHaveProperty(
    'major',
    10,
  );
  expect(getSupportedNodeVersion('8.5.0 - 10.5.0')).resolves.toHaveProperty(
    'major',
    10,
  );
  expect(getSupportedNodeVersion('>=9.0.0')).resolves.toHaveProperty(
    'major',
    10,
  );
  expect(getSupportedNodeVersion('>=9.5.0 <=10.5.0')).resolves.toHaveProperty(
    'major',
    10,
  );
  expect(getSupportedNodeVersion('~10.5.0')).resolves.toHaveProperty(
    'major',
    10,
  );
  expect(getSupportedNodeVersion('^10.5.0')).resolves.toHaveProperty(
    'major',
    10,
  );
});

// own fixtures

const fixturesPath = path.resolve(__dirname, 'fixtures');

// eslint-disable-next-line no-restricted-syntax
for (const fixture of fs.readdirSync(fixturesPath)) {
  // eslint-disable-next-line no-loop-func
  it(`should build ${fixture}`, async () => {
    await expect(
      testDeployment(
        { builderUrl, buildUtilsUrl },
        path.join(fixturesPath, fixture),
      ),
    ).resolves.toBeDefined();
  });
}

// few foreign tests

const buildersToTestWith = ['now-node-server', 'now-static-build'];

// eslint-disable-next-line no-restricted-syntax
for (const builder of buildersToTestWith) {
  const fixturesPath2 = path.resolve(
    __dirname,
    `../../${builder}/test/fixtures`,
  );

  // eslint-disable-next-line no-restricted-syntax
  for (const fixture of fs.readdirSync(fixturesPath2)) {
    // don't run all foreign fixtures, just some
    if (['01-cowsay', '03-env-vars'].includes(fixture)) {
      // eslint-disable-next-line no-loop-func
      it(`should build ${builder}/${fixture}`, async () => {
        await expect(
          testDeployment(
            { builderUrl, buildUtilsUrl },
            path.join(fixturesPath2, fixture),
          ),
        ).resolves.toBeDefined();
      });
    }
  }
}
