#!/usr/bin/env python3
"""
Arena AI — Relay Agent
Runs INSIDE each VM (Windows 11 / Kali Linux)
Bridges between the Arena AI dashboard and OpenClaw

Install: pip install requests
Run:     python relay_agent.py --vm-id vm-a --role defender --dashboard http://HOST_IP:9020
"""

import argparse
import json
import logging
import os
import subprocess
import threading
import time
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from pathlib import Path

import requests

parser = argparse.ArgumentParser(description='Arena AI Relay Agent')
parser.add_argument('--vm-id',    required=True, help='VM ID (e.g. vm-a or vm-b)')
parser.add_argument('--role',     required=True, choices=['attacker', 'defender'])
parser.add_argument('--dashboard', required=True, help='Dashboard URL e.g. http://192.168.1.100:9020')
parser.add_argument('--openclaw-log', default='~/.openclaw/logs/current.log',
                    help='Path to OpenClaw log file')
parser.add_argument('--port',     type=int, default=9030, help='Port for relay agent HTTP server')
args = parser.parse_args()

VM_ID = args.vm_id
ROLE = args.role
DASHBOARD = args.dashboard.rstrip('/')
PORT = args.port

# On Windows, if the user didn't override --openclaw-log, point the watcher at
# the file we explicitly write OpenClaw's stdout to. Otherwise OpenClaw output
# never reaches the dashboard until OpenClaw itself writes to current.log.
WIN_OPENCLAW_STDOUT = r'C:\Temp\relay_oc_stdout.txt'
if os.name == 'nt' and args.openclaw_log == parser.get_default('openclaw_log'):
    LOG_PATH = Path(WIN_OPENCLAW_STDOUT)
else:
    LOG_PATH = Path(args.openclaw_log).expanduser()

logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')
log = logging.getLogger('relay')

current_round_id = None
last_log_pos = 0
active_processes = []  # keep Windows subprocess handles alive to prevent GC


def post_activity(message, level='info', raw=None):
    try:
        requests.post(f'{DASHBOARD}/api/logs', json={
            'roundId': current_round_id,
            'vmId': VM_ID,
            'vmRole': ROLE,
            'level': level,
            'message': message,
            'raw': raw,
        }, timeout=5)
    except Exception as e:
        log.warning(f'Could not post activity: {e}')


def heartbeat_loop():
    global current_round_id
    while True:
        try:
            oc_active = LOG_PATH.exists() and LOG_PATH.stat().st_size > 0
            r = requests.post(
                f'{DASHBOARD}/api/heartbeat',
                json={'vmId': VM_ID, 'openclaw_active': oc_active},
                timeout=5,
            )
            # The dashboard tells us the active round id; pick it up so logs
            # we post afterward get associated with it (fixes post-restart
            # recovery where /instruct never fires).
            try:
                data = r.json()
                rid = data.get('roundId')
                if rid and rid != current_round_id:
                    current_round_id = rid
                    log.info(f'Adopted round id from heartbeat: {rid}')
            except Exception:
                pass
        except Exception as e:
            log.warning(f'Heartbeat failed: {e}')
        time.sleep(25)


def detect_level(line):
    l = line.lower()
    if any(x in l for x in ['error', 'fail', 'exception']): return 'error'
    if any(x in l for x in ['warn', 'caution']): return 'warn'
    if any(x in l for x in ['flag', 'captured', 'success', 'win']): return 'success'
    if ROLE == 'attacker' and any(x in l for x in ['scan', 'exploit', 'attack', 'payload', 'shell', 'breach']): return 'attack'
    if ROLE == 'defender' and any(x in l for x in ['block', 'deny', 'detect', 'alert', 'patch', 'defend']): return 'defend'
    return 'info'


def detect_flag(line):
    import re
    match = re.search(r'ARENA\{[A-Z0-9]+\}', line)
    if match:
        flag = match.group(0)
        log.info(f'FLAG DETECTED IN LOG: {flag}')
        try:
            r = requests.post(f'{DASHBOARD}/api/flag/submit', json={'flag': flag, 'vmId': VM_ID}, timeout=10)
            result = r.json()
            post_activity(f'🚩 Flag submitted: {result.get("message", "?")}', level='attack')
        except Exception as e:
            log.error(f'Flag submit failed: {e}')


def watch_log():
    global last_log_pos
    log.info(f'Watching OpenClaw log: {LOG_PATH}')
    while True:
        try:
            if LOG_PATH.exists():
                size = LOG_PATH.stat().st_size
                if last_log_pos > size:
                    log.info(f'Log truncated (was {last_log_pos}, now {size}); resetting to 0')
                    last_log_pos = 0
                with open(LOG_PATH, 'r', errors='replace') as f:
                    f.seek(last_log_pos)
                    for line in f:
                        line = line.strip()
                        if line:
                            level = detect_level(line)
                            post_activity(line, level=level, raw=line)
                            if ROLE == 'attacker':
                                detect_flag(line)
                    last_log_pos = f.tell()
        except Exception as e:
            log.error(f'Log watch error: {e}')
        time.sleep(1)


def send_to_openclaw(instruction):
    """Auto-executes OpenClaw and pipes output to LOG_PATH."""
    log.info(f'Starting OpenClaw process... ({len(instruction)} chars)')

    try:
        if os.name == 'nt':
            # Ensure the stdout sink directory exists (a fresh Windows install
            # may not have C:\Temp). Open append-mode so prior instructions'
            # output isn't wiped on each call.
            os.makedirs(r'C:\Temp', exist_ok=True)
            oc_stdout = open(WIN_OPENCLAW_STDOUT, 'a', encoding='utf-8')

            # Clear stale session lock files that block embedded mode
            sessions_dir = Path(r'C:\Users') / os.environ.get('USERNAME', 'administrator') / '.openclaw' / 'agents' / 'main' / 'sessions'
            try:
                for lock in sessions_dir.glob('*.lock'):
                    lock.unlink(missing_ok=True)
            except Exception:
                pass

            oc_path = os.path.expandvars(r'%APPDATA%\npm\openclaw.cmd')
            if not os.path.exists(oc_path):
                oc_path = r'C:\WINDOWS\system32\config\systemprofile\AppData\Roaming\npm\openclaw.cmd'
            # Verify the executable exists before launching — without this the
            # cmd.exe wrapper masks "openclaw.cmd not found" as a normal exit
            # code, and we'd return success=True for a no-op.
            if not os.path.exists(oc_path):
                oc_stdout.close()
                raise FileNotFoundError(oc_path)

            cmd = [oc_path, 'agent', '--agent', 'main', '--local', '--json', '--message', instruction]
            proc = subprocess.Popen(
                cmd,
                stdout=oc_stdout,
                stderr=subprocess.STDOUT,
                stdin=subprocess.DEVNULL,
                text=True,
                creationflags=subprocess.CREATE_NO_WINDOW,
            )
            log.info(f'OpenClaw started with PID {proc.pid}, cmd={cmd}')
            active_processes.append((proc, oc_stdout))

            def _windows_cleanup(p, f):
                try:
                    p.wait()
                except Exception:
                    pass
                try:
                    f.close()
                except Exception:
                    pass
                try:
                    log.info(f'OpenClaw process exited with code {p.returncode}')
                    if p.returncode != 0:
                        try:
                            requests.post(f'{DASHBOARD}/api/logs', json={
                                'roundId': current_round_id,
                                'vmId': VM_ID,
                                'vmRole': ROLE,
                                'level': 'error',
                                'message': f'OpenClaw exited with code {p.returncode} — see {WIN_OPENCLAW_STDOUT}',
                            }, timeout=5)
                        except Exception:
                            pass
                except Exception:
                    pass
                try:
                    active_processes.remove((p, f))
                except ValueError:
                    pass

            threading.Thread(target=_windows_cleanup, args=(proc, oc_stdout), daemon=True).start()
            return True
        else:
            log_file = open(LOG_PATH, 'a', encoding='utf-8')
            cmd = ['stdbuf', '-o0', '-e0', 'openclaw', 'agent', '--agent', 'main', '--local', '--json', '--message', instruction]
            proc = subprocess.Popen(
                cmd,
                stdout=log_file,
                stderr=subprocess.STDOUT,
                text=True,
            )
            active_processes.append((proc, log_file))
            log.info(f'OpenClaw started with PID {proc.pid}')
            return True
    except FileNotFoundError:
        log.warning('OpenClaw CLI not found. Falling back to instruction file.')
        post_activity('⚠️ OpenClaw CLI not found. Falling back to instruction.txt', level='warn')
        try:
            instr_file = Path('~/.openclaw/instruction.txt').expanduser()
            instr_file.parent.mkdir(parents=True, exist_ok=True)
            instr_file.write_text(instruction, encoding='utf-8')
            post_activity('📝 Instruction written to fallback file', level='info')
            return True
        except Exception as e:
            log.error(f'Fallback failed: {e}')
            return False


class RelayHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass

    def do_POST(self):
        length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(length)

        if self.path == '/instruct':
            try:
                data = json.loads(body)
                global current_round_id
                instruction = data.get('instruction', '')
                current_round_id = data.get('roundId')
                flag = data.get('flag')

                if flag and ROLE == 'defender':
                    desktop = Path.home() / 'Desktop'
                    if os.name == 'nt':
                        desktop = Path(os.environ.get('USERPROFILE', '~')) / 'Desktop'
                    desktop.mkdir(parents=True, exist_ok=True)
                    flag_file = desktop / 'flag.txt'
                    flag_file.write_text(flag, encoding='utf-8')
                    post_activity(f'Secret Flag secretly placed at {flag_file}', level='success')

                post_activity(f'Received instruction from dashboard ({len(instruction)} chars)', level='info')
                success = send_to_openclaw(instruction)

                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'success': success}).encode())
            except Exception as e:
                self.send_response(500)
                self.end_headers()
                self.wfile.write(json.dumps({'error': str(e)}).encode())

        elif self.path == '/ping':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'status': 'ok', 'vm_id': VM_ID, 'role': ROLE}).encode())

        else:
            self.send_response(404)
            self.end_headers()

    def do_GET(self):
        if self.path == '/status':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({
                'vm_id': VM_ID, 'role': ROLE, 'dashboard': DASHBOARD,
                'log_path': str(LOG_PATH), 'round_id': current_round_id,
            }).encode())
        else:
            self.send_response(404)
            self.end_headers()


if __name__ == '__main__':
    log.info(f'Arena AI Relay Agent starting...')
    log.info(f'VM ID: {VM_ID} | Role: {ROLE} | Dashboard: {DASHBOARD}')
    log.info(f'Listening on port {PORT}')
    log.info(f'Watching log file: {LOG_PATH}')

    threading.Thread(target=heartbeat_loop, daemon=True).start()
    threading.Thread(target=watch_log, daemon=True).start()

    post_activity(f'Relay agent started — {ROLE} VM ready', level='success')

    # ThreadingHTTPServer so a long /instruct doesn't block /status pings.
    server = ThreadingHTTPServer(('0.0.0.0', PORT), RelayHandler)
    log.info(f'Relay agent listening on 0.0.0.0:{PORT}')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        log.info('Relay agent stopped')
        post_activity('Relay agent stopped', level='warn')
