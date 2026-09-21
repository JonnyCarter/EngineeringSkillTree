const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const pidPath = path.join(__dirname, '..', '.skilltree-server.pid');

function removeStalePidFile() {
  try {
    fs.unlinkSync(pidPath);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }
}

if (!fs.existsSync(pidPath)) {
  console.log('Skill Tree server is not running or was started before PID tracking was enabled.');
  process.exit(0);
}

const pid = Number.parseInt(fs.readFileSync(pidPath, 'utf8').trim(), 10);
if (!Number.isSafeInteger(pid) || pid <= 0) {
  removeStalePidFile();
  console.error('Removed an invalid Skill Tree server PID file.');
  process.exitCode = 1;
  return;
}

try {
  process.kill(pid, 0);
} catch (error) {
  if (error.code === 'ESRCH') {
    removeStalePidFile();
    console.log('Removed a stale PID file; the Skill Tree server was already stopped.');
    process.exit(0);
  }
  throw error;
}

try {
  const command = execFileSync('ps', ['-p', String(pid), '-o', 'command='], { encoding: 'utf8' }).trim();
  if (!command.includes('server/server.js')) {
    console.error(`Refusing to stop PID ${pid} because it is not the Skill Tree server.`);
    process.exitCode = 1;
    return;
  }
} catch (error) {
  console.error(`Could not verify Skill Tree server PID ${pid}: ${error.message}`);
  process.exitCode = 1;
  return;
}

process.kill(pid, 'SIGTERM');
console.log(`Stop signal sent to Skill Tree server (PID ${pid}).`);
