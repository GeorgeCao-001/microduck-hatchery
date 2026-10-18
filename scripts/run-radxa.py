"""Explicit Radxa entrypoints; hardware paths come from the board configuration."""
from __future__ import annotations
import argparse
import os
from pathlib import Path
import sys
import socket
import stat

ROOT = Path(__file__).resolve().parents[1]

def load_environment(path):
    if not path.exists():
        return
    for number, line in enumerate(path.read_text(encoding='utf-8').splitlines(), 1):
        line = line.strip()
        if not line or line.startswith('#'):
            continue
        key, separator, value = line.partition('=')
        if not separator or not key.replace('_', '').isalnum() or not key.startswith('HATCHERY_'):
            raise ValueError(f'{path}:{number}: invalid environment entry')
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in ('"', "'"):
            value = value[1:-1]
        os.environ.setdefault(key, value)

def required(name):
    value = os.environ.get(name, '').strip()
    if not value:
        raise ValueError(f'Set {name} to this board\'s actual value in hatchery.env.')
    return value

def binary(name):
    directory = Path(os.environ.get('CARGO_TARGET_DIR', ROOT / 'src/target'))
    if not directory.is_absolute():
        directory = ROOT / 'src' / directory
    path = directory / 'release' / name
    if not path.is_file():
        build = 'python3 scripts/build-rkaiq.py' if name == 'hatchery-rkaiq-3a' else 'sh scripts/build-radxa.sh'
        raise ValueError(f'{path} is missing; build with {build} first.')
    return str(path)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('mode', choices=['robot', 'media', 'maintenance', 'config', 'isp'])
    parser.add_argument('--env-file', type=Path, default=Path('/etc/robot/hatchery.env'))
    args = parser.parse_args()
    if sys.platform != 'linux':
        parser.error('This launcher targets Radxa Linux; desktop maintenance uses hatchery-maintenance.py.')
    # systemd already reads EnvironmentFile before dropping to the robot user.
    # Do not reopen its root-owned 0600 file from the unprivileged service.
    if not os.environ.get('INVOCATION_ID'):
        load_environment(args.env_file)
    runtime = os.environ.get('DUCK_RUNTIME_DIR')
    if runtime is None and args.mode not in ('maintenance', 'config'):
        runtime = '/run/robot' if os.environ.get('INVOCATION_ID') else str(Path.home() / '.local/state/microduck-hatchery/run')
        Path(runtime).mkdir(parents=True, exist_ok=True)
        os.environ['DUCK_RUNTIME_DIR'] = runtime
    params = os.environ.get('HATCHERY_PARAMS', '/etc/robot/robotd.toml')
    if args.mode == 'isp':
        # This is the same 3A process with an extra local API, not a concurrent engine.
        for proc in Path('/proc').iterdir():
            if not proc.name.isdecimal():
                continue
            try:
                name = (proc / 'comm').read_text().strip()
                if name in ('rkaiq_3A_server', 'hatchery-rkaiq-'):
                    raise ValueError(f'RKAIQ is already running (PID {proc.name}). Stop its existing unit manually before testing; this launcher will not stop it.')
            except (OSError, PermissionError):
                continue
        required('HATCHERY_CAMERA_DEVICE')
        path = Path(os.environ.setdefault('HATCHERY_RKAIQ_CONTROL_SOCKET', str(Path(runtime) / 'rkaiq-control.sock')))
        if path.exists():
            info = path.lstat()
            if not stat.S_ISSOCK(info.st_mode) or info.st_uid != os.getuid():
                raise ValueError(f'Refusing to replace {path}.')
            with socket.socket(socket.AF_UNIX) as probe:
                probe.settimeout(.3)
                try:
                    probe.connect(str(path))
                except ConnectionRefusedError:
                    path.unlink()
                else:
                    raise ValueError(f'ISP control socket is already live: {path}')
        command = [binary('hatchery-rkaiq-3a')]
    elif args.mode == 'robot':
        command = [binary('robotd'), '--params', params, '--port', required('HATCHERY_SERIAL_PORT'),
                   '--socket', os.environ.get('HATCHERY_ROBOT_SOCKET', str(Path(runtime) / 'robotd.sock')), '--no-policy']
    elif args.mode == 'config':
        socket=os.environ.get('HATCHERY_CONFIG_SOCKET', '/run/configd.sock')
        command=[binary('configd'), '--socket', socket, '--allow-user', os.environ.get('HATCHERY_CONFIG_ALLOW_USER', 'duck')]
    elif args.mode == 'media':
        extra='/usr/local/lib/gstreamer-1.0'
        existing=os.environ.get('GST_PLUGIN_PATH', '').split(os.pathsep)
        os.environ['GST_PLUGIN_PATH']=os.pathsep.join([extra]+[p for p in existing if p and p!=extra])
        command = [binary('mediad'), '--config', params, '--camera-device', required('HATCHERY_CAMERA_DEVICE'),
                   '--host', os.environ.get('HATCHERY_MEDIA_HOST', '127.0.0.1'),
                   '--web-port', os.environ.get('HATCHERY_CAMERA_HTTP_PORT', '8080'),
                   '--port', os.environ.get('HATCHERY_SIGNALLING_PORT', '8443'),
                   '--rotate', os.environ.get('HATCHERY_CAMERA_ROTATE', '90'),
                   '--robot-socket', os.environ.get('HATCHERY_ROBOT_SOCKET', str(Path(runtime) / 'robotd.sock')),
                   '--config-socket', os.environ.get('HATCHERY_CONFIG_SOCKET', str(Path(runtime) / 'configd.sock') if not os.environ.get('INVOCATION_ID') else '/run/configd.sock'),
                   '--frame-socket', os.environ.get('HATCHERY_FRAME_SOCKET', str(Path(runtime) / 'media-frame.sock')), '--no-remote']
        if os.environ.get('HATCHERY_CONFIGURE_SENSOR', '0') == '1':
            command.append('--configure-sensor')
        else:
            command.append('--no-auto-exposure')
    else:
        command = [sys.executable, str(ROOT / 'scripts/hatchery-maintenance.py'), '--release', '--no-build',
                   '--port', required('HATCHERY_SERIAL_PORT'),
                   '--baud', os.environ.get('HATCHERY_BAUD', '1000000'), '--reference-feedback',
                   '--http-port', os.environ.get('HATCHERY_MAINTENANCE_HTTP_PORT', '8088')]
        if os.environ.get('HATCHERY_SERVO_IDS', '').strip():
            command += ['--ids', os.environ['HATCHERY_SERVO_IDS']]
        if os.environ.get('HATCHERY_BENCH_CONTROL', '0') == '1':
            command += ['--bench-control', '--profile', 'fd-hlsxx']
    os.chdir(ROOT)
    os.execv(command[0], command)

if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError) as error:
        print(error, file=sys.stderr)
        raise SystemExit(1)
