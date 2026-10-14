"""Build and launch robotd + gateway maintenance; no Python serial IO."""
from __future__ import annotations
import argparse
import os
from pathlib import Path
import secrets
import shutil
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
WORKSPACE = ROOT / 'src'

def target_directory(env):
    directory = Path(env.get('CARGO_TARGET_DIR', WORKSPACE / 'target'))
    return directory if directory.is_absolute() else WORKSPACE / directory

def build_environment():
    env = os.environ.copy()
    local = ROOT / '.local'
    toolchain = local / 'rustup/toolchains/stable-x86_64-pc-windows-gnu'
    if sys.platform == 'win32' and (toolchain / 'bin/cargo.exe').is_file():
        env['CARGO_HOME'] = str(local / 'cargo')
        env['RUSTUP_HOME'] = str(local / 'rustup')
        env['RUSTC'] = str(toolchain / 'bin/rustc.exe')
        env['RUSTDOC'] = str(toolchain / 'bin/rustdoc.exe')
        env['PATH'] = str(toolchain / 'bin') + os.pathsep + env.get('PATH', '')
        # Invoke the bundled linker directly; do not use the host MSYS2 compiler.
        linker = local / 'rust-bootstrap/ld.lld.exe'
        if linker.is_file():
            flags = ['-C','linker-flavor=ld','-C',f'linker={linker}','-C','link-self-contained=yes']
            env['CARGO_ENCODED_RUSTFLAGS'] = '\x1f'.join(flags)
            env.pop('RUSTFLAGS', None)
        return str(toolchain / 'bin/cargo.exe'), env
    cargo = shutil.which('cargo')
    if cargo is None:
        raise RuntimeError('Rust/Cargo not found. Install the pinned Rust toolchain before building.')
    return cargo, env

def stop(process):
    if process.poll() is None:
        process.terminate()
        try:
            process.wait(timeout=3)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=3)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--fixture', action='store_true', help='explicit fake fixture, never opens a port')
    parser.add_argument('--port', help='explicit serial path; omitted by default')
    parser.add_argument('--ids', help='optional initial IDs; discover any 0..253 ID in the parameters page')
    parser.add_argument('--reference-feedback', action='store_true', help='read frozen reference window; HD profile remains unconfirmed')
    parser.add_argument('--bench-control', action='store_true', help='explicitly allow bounded raw SRAM bench operations, never joint angle control')
    parser.add_argument('--profile', choices=['fd-hlsxx'], help='operator-selected FD reference profile; requires hardware verification')
    parser.add_argument('--baud', type=int, default=1_000_000)
    parser.add_argument('--http-port', type=int, default=8088)
    parser.add_argument('--rpc-port', type=int, default=8871)
    parser.add_argument('--build-only', action='store_true')
    parser.add_argument('--release', action='store_true', help='build/use the release binaries, including on Radxa')
    parser.add_argument('--list-ports', action='store_true', help='enumerate serial paths without opening them')
    parser.add_argument('--no-build', action='store_true', help='run existing binaries')
    args = parser.parse_args()
    if args.list_ports and (args.fixture or args.port or args.ids or args.reference_feedback or args.build_only or args.bench_control or args.profile):
        parser.error('--list-ports cannot be combined with a connection or --build-only')
    if args.fixture and args.port:
        parser.error('--fixture cannot be combined with --port')
    if args.reference_feedback and not args.port:
        parser.error('--reference-feedback requires --port')
    if args.bench_control and (not args.port or not args.reference_feedback or args.profile != 'fd-hlsxx'):
        parser.error('--bench-control requires --port, --reference-feedback and --profile fd-hlsxx')
    if not all(1024 <= p <= 65535 for p in [args.http_port,args.rpc_port]) or args.http_port == args.rpc_port:
        parser.error('use distinct ports in 1024..65535')
    env = os.environ.copy()
    if not args.no_build:
        cargo, env = build_environment()
        build = [cargo,'build','--locked','--bin','robotd-maintenance','--bin','mediad-maintenance','-j','2']
        if args.release:
            build.append('--release')
        subprocess.run(build,cwd=WORKSPACE,env=env,check=True)
    if args.build_only:
        return 0
    env['HATCHERY_RPC_TOKEN'] = secrets.token_urlsafe(32)
    env['HATCHERY_HTTP_TOKEN'] = secrets.token_urlsafe(32)
    suffix = '.exe' if sys.platform == 'win32' else ''
    binary_root = target_directory(env) / ('release' if args.release else 'debug')
    binaries = [binary_root / ('robotd-maintenance'+suffix),binary_root / ('mediad-maintenance'+suffix)]
    if not all(p.is_file() for p in binaries):
        raise RuntimeError('robotd/mediad binaries missing; run without --no-build')
    if args.list_ports:
        subprocess.run([str(binaries[0]),'--list-ports'],cwd=ROOT,env=env,check=True)
        return 0
    robot = [str(binaries[0]),'--rpc',f'127.0.0.1:{args.rpc_port}']
    if args.fixture:
        robot.append('--fixture')
    if args.port:
        robot += ['--port',args.port,'--baud',str(args.baud)]
    if args.ids:
        robot += ['--ids',args.ids]
    if args.reference_feedback:
        robot.append('--reference-feedback')
    if args.profile:
        robot += ['--profile',args.profile]
    if args.bench_control:
        robot.append('--bench-control')
    gateway = [str(binaries[1]),'--http',f'127.0.0.1:{args.http_port}','--rpc',f'127.0.0.1:{args.rpc_port}','--web-root',str(ROOT/'web/prototype')]
    processes = []
    try:
        for command in [robot,gateway]:
            # Python owns Ctrl+C and cleanup; services do not need console input.
            flags = subprocess.CREATE_NO_WINDOW if sys.platform == 'win32' else 0
            try:
                process = subprocess.Popen(command,cwd=ROOT,env=env,stdin=subprocess.DEVNULL,creationflags=flags)
            except OSError as error:
                raise RuntimeError(f'Cannot start {Path(command[0]).name}: {error}') from error
            processes.append(process)
            time.sleep(.2)
            if process.poll() is not None:
                raise RuntimeError(f'{Path(command[0]).name} exited before startup')
        print(f'Open http://127.0.0.1:{args.http_port}/#console/servos/parameters ; Ctrl+C stops both services',flush=True)
        while all(p.poll() is None for p in processes):
            time.sleep(.3)
        raise RuntimeError('A backend process exited; both services are stopping')
    except KeyboardInterrupt:
        return 0
    finally:
        for process in reversed(processes):
            stop(process)

if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except (RuntimeError,OSError,subprocess.CalledProcessError) as error:
        print(str(error),file=sys.stderr)
        raise SystemExit(1)
