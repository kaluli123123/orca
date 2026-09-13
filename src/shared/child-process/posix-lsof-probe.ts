// Uses the owned process-group lifecycle from codex-app-server-posix-supervisor.
export const RELAY_LSOF_PROBE_JS = String.raw`
var child = require('child_process').spawn('lsof', ['-t', '-a', '-U', process.argv[1]], {
  detached: true,
  stdio: ['ignore', 'pipe', 'pipe']
});
var output = '';
var stderrSeen = false;
var stderrBytes = 0;
var byteCount = 0;
var unavailable = false;
var exited = false;
var closed = false;
var settling = false;
var finished = false;
var cleanupEnd = 0;
var originalParent = process.ppid;
var maxBytes = 1024 * 1024;
function groupExists() {
  if (!child.pid) return false;
  try { process.kill(-child.pid, 0); return true; }
  catch (error) { return error.code !== 'ESRCH'; }
}
function finish(unconfirmed) {
  if (finished) return;
  finished = true;
  clearTimeout(deadline);
  clearInterval(ownerTimer);
  var lines = output.split('\n');
  if (lines.pop()) unavailable = true;
  var pids = lines.filter(function(line) {
    if (/^[1-9][0-9]*$/.test(line)) return true;
    unavailable = true;
    return false;
  });
  var marker = unconfirmed ? 'cleanup-unconfirmed' : (unavailable || stderrSeen ? 'unavailable' : 'lsof');
  process.stdout.write(marker + '\n' + pids.join('\n') + '\n', function() { process.exit(0); });
}
function checkCleanup() {
  if (finished) return;
  if (exited && closed && !groupExists()) return finish(false);
  if (Date.now() >= cleanupEnd) return finish(true);
  setTimeout(checkCleanup, 25);
}
function cleanup() {
  if (settling) return;
  settling = true;
  clearTimeout(deadline);
  cleanupEnd = Date.now() + 1500;
  if (child.pid) {
    try { process.kill(-child.pid, 'SIGKILL'); }
    catch (error) { if (error.code !== 'ESRCH') return finish(true); }
  }
  checkCleanup();
}
child.stdout.on('data', function(chunk) {
  var remaining = Math.max(0, maxBytes - byteCount);
  byteCount += chunk.length;
  output += chunk.slice(0, remaining).toString('utf8');
  if (byteCount > maxBytes) { unavailable = true; cleanup(); }
});
child.stderr.on('data', function(chunk) {
  if (chunk.toString('utf8').trim()) stderrSeen = true;
  stderrBytes += chunk.length;
  if (stderrBytes > maxBytes) { unavailable = true; cleanup(); }
});
[child.stdout, child.stderr].forEach(function(stream) {
  stream.on('error', function() { unavailable = true; cleanup(); });
});
child.on('error', function() { unavailable = true; exited = true; cleanup(); });
child.on('exit', function(code, signal) {
  exited = true;
  if ((code !== 0 && code !== 1) || signal) unavailable = true;
  cleanup();
});
child.on('close', function() { closed = true; });
var deadline = setTimeout(function() { unavailable = true; cleanup(); }, 5000);
var ownerTimer = setInterval(function() {
  if (process.ppid !== originalParent) { unavailable = true; cleanup(); }
}, 100);
['SIGTERM', 'SIGHUP', 'SIGINT'].forEach(function(signal) {
  process.on(signal, function() { unavailable = true; cleanup(); });
});
`
