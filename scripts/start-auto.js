const { spawn } = require('child_process');
const https = require('https');

function checkInternet(timeout = 2000) {
  return new Promise((resolve) => {
    const req = https.request({ hostname: 'example.com', method: 'HEAD', timeout }, (res) => {
      resolve(true);
    });

    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });

    req.on('error', () => resolve(false));
    req.end();
  });
}

function spawnCommand(command, args, envVars = {}) {
  const env = Object.assign({}, process.env, envVars);
  const child = spawn(command, args, { stdio: 'inherit', shell: true, env });

  child.on('exit', (code) => process.exit(code));
  child.on('error', (err) => {
    console.error('Failed to start process:', err);
    process.exit(1);
  });
}

async function main() {
  const argv = process.argv.slice(2);
  const targetArg = argv.find(a => a.startsWith('--target='));
  const target = targetArg ? targetArg.split('=')[1] : 'both';

  const online = await checkInternet(2000).catch(() => false);

  if (online) {
    console.log('🌐 Internet detected — starting in online/dev mode');
  } else {
    console.log('⚠️ No internet detected — forcing offline datastore for dev');
  }

  const envVars = online ? {} : { USE_OFFLINE_DB: 'true' };

  if (target === 'backend') {
    spawnCommand('npm', ['run', 'server:dev'], envVars);
  } else if (target === 'frontend') {
    spawnCommand('npm', ['run', 'client:dev'], envVars);
  } else {
    // both
    spawnCommand('npm', ['run', 'dev'], envVars);
  }
}

main();
