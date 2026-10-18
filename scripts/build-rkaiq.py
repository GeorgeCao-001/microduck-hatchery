"""Build the upstream 3A server with its in-process ISP21 controls; install nothing."""
from pathlib import Path
import argparse
import os
import shlex
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]


def commands(sdk, output):
    source = ROOT / 'src/daemons/mediad/rkaiq'
    includes = [sdk / p for p in ('', 'uAPI2', 'common', 'xcore', 'algos', 'iq_parser', 'iq_parser_v2', 'isp')]
    flags = ['-I' + str(p) for p in includes]
    obj = output.parent / 'rkaiq-mediactl.o'
    return [
        shlex.split(os.environ.get('CC', 'cc')) + ['-std=gnu11', '-O2', '-D_GNU_SOURCE', '-c',
            str(source / 'common/mediactl/mediactl.c'), '-o', str(obj)],
        shlex.split(os.environ.get('CXX', 'c++')) + ['-std=c++17', '-O2', '-D_GNU_SOURCE', '-pthread'] + flags + [
            str(source / 'rkaiq_3A_server.cpp'), str(source / 'controls.cpp'), str(obj),
            '-lrkaiq', '-ldl', '-o', str(output)],
    ]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--sdk', type=Path, default=Path('/usr/include/rkaiq'))
    args = parser.parse_args()
    if sys.platform != 'linux':
        parser.error('Build on Radxa Linux against its installed RKAIQ headers and library.')
    if not (args.sdk / 'uAPI2/rk_aiq_user_api2_imgproc.h').is_file():
        parser.error('The installed camera-engine-rkaiq headers are missing; do not substitute an unrelated SDK version.')
    directory = Path(os.environ.get('CARGO_TARGET_DIR', ROOT / 'src/target'))
    if not directory.is_absolute():
        directory = ROOT / 'src' / directory
    output = directory / 'release/hatchery-rkaiq-3a'
    output.parent.mkdir(parents=True, exist_ok=True)
    for command in commands(args.sdk, output):
        subprocess.run(command, check=True)
    print(f'Built {output}; no service or ISP configuration was changed.')


if __name__ == '__main__':
    main()
