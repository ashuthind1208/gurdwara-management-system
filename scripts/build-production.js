const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const loadEnvFile = (filePath) => {
  if (!fs.existsSync(filePath)) return {};
  return Object.fromEntries(fs.readFileSync(filePath, 'utf8').split(/\r?\n/).flatMap((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return [];
    const separator = trimmed.indexOf('=');
    if (separator < 1) return [];
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    return [[key, value]];
  }));
};

const workspaceRoot = path.resolve(__dirname, '..');
const productionEnvPath = path.join(workspaceRoot, '.env.production');
const publicProductionEnvPath = path.join(workspaceRoot, 'production-frontend.config');
const selectedProductionEnvPath = fs.existsSync(productionEnvPath) ? productionEnvPath : publicProductionEnvPath;
const productionEnv = loadEnvFile(selectedProductionEnvPath);
const localEnv = loadEnvFile(path.join(workspaceRoot, '.env.local'));

if (!fs.existsSync(selectedProductionEnvPath)) {
  console.error('Missing production frontend configuration (.env.production or production-frontend.config). Refusing to create an unconfigured production bundle.');
  process.exit(1);
}

const unsupportedKeys = Object.keys(productionEnv).filter((key) => !key.startsWith('REACT_APP_'));
const sensitiveKeys = Object.keys(productionEnv).filter((key) => /(SECRET|PASSWORD|PRIVATE_KEY|API_KEY|ACCESS_TOKEN)/i.test(key));
const localValues = Object.entries(productionEnv)
  .filter(([, value]) => /localhost|127\.0\.0\.1|sk_test_|whsec_/i.test(value))
  .map(([key]) => key);

if (unsupportedKeys.length > 0 || sensitiveKeys.length > 0 || localValues.length > 0) {
  console.error('Unsafe .env.production configuration detected.');
  if (unsupportedKeys.length > 0) console.error(`Only REACT_APP_* keys are allowed: ${unsupportedKeys.join(', ')}`);
  if (sensitiveKeys.length > 0) console.error(`Potential secret keys are not allowed: ${sensitiveKeys.join(', ')}`);
  if (localValues.length > 0) console.error(`Local/test values are not allowed: ${localValues.join(', ')}`);
  process.exit(1);
}

const backendStartupFiles = [
  'server.js',
  path.join('scripts', 'start-production.js'),
  path.join('server', 'index.js')
];
for (const startupFile of backendStartupFiles) {
  const check = spawnSync(process.execPath, ['--check', path.join(workspaceRoot, startupFile)], {
    cwd: workspaceRoot,
    stdio: 'inherit'
  });
  if (check.error || check.status !== 0) {
    console.error(`Backend startup syntax check failed: ${startupFile}`);
    process.exit(1);
  }
}

const inheritedEnv = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !key.startsWith('REACT_APP_'))
);
const blockedLocalFrontendEnv = Object.fromEntries(
  Object.keys(localEnv).filter((key) => key.startsWith('REACT_APP_')).map((key) => [key, ''])
);
const reactScripts = require.resolve('react-scripts/bin/react-scripts');
const result = spawnSync(process.execPath, [reactScripts, 'build'], {
  cwd: workspaceRoot,
  stdio: 'inherit',
  env: {
    ...inheritedEnv,
    ...blockedLocalFrontendEnv,
    ...productionEnv,
    NODE_ENV: 'production',
    BABEL_ENV: 'production'
  }
});

if (result.error) {
  console.error(result.error.message || result.error);
  process.exit(1);
}

process.exit(result.status ?? 1);