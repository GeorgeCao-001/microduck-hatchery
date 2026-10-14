"""Explicit Radxa entrypoints; hardware paths come from the board configuration."""
from __future__ import annotations
import argparse
import os
from pathlib import Path
import sys

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
        raise ValueError(f'{path} is missing; build with sh scripts/build-radxa.sh first.')
    return str(path)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('mode', choices=['robot', 'media', 'maintenance'])
    parser.add_argument('--env-file', type=Path, default=Path('/etc/robot/hatchery.env'))
    args = parser.parse_args()
    if sys.platform != 'linux':
        parser.error('This launcher targets Radxa Linux; desktop maintenance uses hatchery-maintenance.py.')
    # systemd already reads EnvironmentFile before dropping to the robot user.
    # Do not reopen its root-owned 0600 file from the unprivileged service.
    if not os.environ.get('INVOCATION_ID'):
        load_environment(args.env_file)
    runtime = os.environ.get('DUCK_RUNTIME_DIR')
    if runtime is None and args.mode != 'maintenance':
        runtime = '/run/robot' if os.environ.get('INVOCATION_ID') else str(Path.home() / '.local/state/microduck-hatchery/run')
        Path(runtime).mkdir(parents=True, exist_ok=True)
        os.environ['DUCK_RUNTIME_DIR'] = runtime
    params = os.environ.get('HATCHERY_PARAMS', '/etc/robot/robotd.toml')
    if args.mode == 'robot':
        command = [binary('robotd'), '--params', params, '--port', required('HATCHERY_SERIAL_PORT'),
                   '--socket', os.environ.get('HATCHERY_ROBOT_SOCKET', str(Path(runtime) / 'robotd.sock')), '--no-policy']
    elif args.mode == 'media':
        command = [binary('mediad'), '--config', params, '--camera-device', required('HATCHERY_CAMERA_DEVICE'),
                   '--host', os.environ.get('HATCHERY_MEDIA_HOST', '127.0.0.1'),
                   '--web-port', os.environ.get('HATCHERY_CAMERA_HTTP_PORT', '8080'),
                   '--port', os.environ.get('HATCHERY_SIGNALLING_PORT', '8443'),
                   '--rotate', os.environ.get('HATCHERY_CAMERA_ROTATE', '90'),
                   '--robot-socket', os.environ.get('HATCHERY_ROBOT_SOCKET', str(Path(runtime) / 'robotd.sock')),
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
