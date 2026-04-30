#!/usr/bin/env node
/**
 * Cross-platform port killer used by `pnpm test:kill-ports`.
 * Reads port numbers from CLI args, kills any process bound to them.
 * Silently no-ops if the port is free.
 */
import { execSync } from 'node:child_process';
import { platform } from 'node:os';

const ports = process.argv.slice(2).filter((arg) => /^\d+$/.test(arg));

if (ports.length === 0) {
  console.error('Usage: kill-ports.mjs <port> [<port>...]');
  process.exit(1);
}

const isWindows = platform() === 'win32';

for (const port of ports) {
  try {
    if (isWindows) {
      // PowerShell: find PID owning the port and stop it.
      execSync(
        `powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort ${port} -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"`,
        { stdio: 'ignore' },
      );
    } else {
      // POSIX: lsof + kill.
      execSync(`lsof -ti:${port} | xargs -r kill -9`, { stdio: 'ignore', shell: '/bin/bash' });
    }
    console.log(`✓ port ${port} cleared`);
  } catch {
    // No process on that port — fine.
  }
}
