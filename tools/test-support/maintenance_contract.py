"""Exercise actual Rust RPC/gateway boundaries using explicit fake data only."""
from pathlib import Path
import http.cookiejar
import json
import os
import secrets
import socket
import subprocess
import time
import unittest
import urllib.error
import urllib.request

ROOT=Path(__file__).resolve().parents[2]
WORKSPACE=ROOT/'src'

def free_port():
    with socket.socket() as sock:
        sock.bind(('127.0.0.1',0))
        return sock.getsockname()[1]

class Contract(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.rpc_port=free_port();cls.http_port=free_port()
        cls.rpc_token=secrets.token_urlsafe(32)
        env=os.environ.copy();env['HATCHERY_RPC_TOKEN']=cls.rpc_token;env['HATCHERY_HTTP_TOKEN']=secrets.token_urlsafe(32)
        suffix='.exe' if os.name=='nt' else ''
        target=Path(env.get('CARGO_TARGET_DIR',WORKSPACE/'target'))
        if not target.is_absolute():target=WORKSPACE/target
        cls.env=env
        cls.commands=[
            [str(target/'debug'/('robotd'+suffix)),'--rpc',f'127.0.0.1:{cls.rpc_port}','--fixture'],
            [str(target/'debug'/('mediad'+suffix)),'--http',f'127.0.0.1:{cls.http_port}','--rpc',f'127.0.0.1:{cls.rpc_port}','--web-root',str(ROOT/'web/prototype')],
        ]
        cls.processes=[]
        cls.addClassCleanup(cls.stop)
        for cmd in cls.commands:
            cls.processes.append(subprocess.Popen(cmd,cwd=ROOT,env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL))
        cls.base=f'http://127.0.0.1:{cls.http_port}'
        cls.jar=http.cookiejar.CookieJar()
        cls.client=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cls.jar))
        for _ in range(50):
            try:
                cls.html=cls.client.open(cls.base+'/',timeout=1).read().decode('utf-8')
                break
            except (OSError,urllib.error.URLError):time.sleep(.1)
        else:raise RuntimeError('Rust gateway failed to start')
        time.sleep(.35)

    @classmethod
    def stop(cls):
        for p in reversed(cls.processes):
            if p.poll() is None:
                p.terminate()
                try:p.wait(timeout=3)
                except subprocess.TimeoutExpired:p.kill();p.wait(timeout=3)

    def rpc(self,method,token=None):
        with socket.create_connection(('127.0.0.1',self.rpc_port),timeout=3) as sock:
            sock.settimeout(3)
            sock.sendall(json.dumps({'jsonrpc':'2.0','id':9,'token':token or self.rpc_token,'method':method}).encode()+b'\n')
            return json.loads(sock.makefile('rb').readline(65537))

    def test_actual_gateway_reports_fixture_and_all_three_mappings(self):
        result=json.load(self.client.open(self.base+'/api/v1/maintenance/state',timeout=3))
        self.assertEqual(result['source'],'fixture');self.assertTrue(result['fake'])
        self.assertFalse(result['hardware_confirmed']);self.assertFalse(result['control_enabled'])
        self.assertEqual([r['id'] for r in result['joints']],[20,21,22,23,24,10,11,12,13,14,30,31,32,33,34])
        self.assertIsNone(result['joints'][-1]['policy_index'])
        self.assertEqual(result['joints'][5]['runtime_index'],10)
        self.assertEqual(len(result['joints'][0]['raw_bytes']),15)
        self.assertIn('window.HATCHERY_BACKEND',self.html)

    def test_rpc_rejects_control_and_wrong_credentials(self):
        for method in ['goal','goals_verify','torque','release','firmware','open_port']:
            self.assertEqual(self.rpc(method)['error']['code'],-32601)
        self.assertEqual(self.rpc('maintenance.state','wrong')['error']['code'],-32001)

    def test_gateway_requires_session_host_origin_and_get(self):
        url=self.base+'/api/v1/maintenance/state'
        with self.assertRaises(urllib.error.HTTPError) as error:urllib.request.urlopen(url,timeout=2)
        self.assertEqual(error.exception.code,401)
        for headers in [{'Host':'evil.invalid'},{'Origin':'https://evil.invalid'}]:
            with self.assertRaises(urllib.error.HTTPError) as error:self.client.open(urllib.request.Request(url,headers=headers),timeout=2)
            self.assertEqual(error.exception.code,403)
        with self.assertRaises(urllib.error.HTTPError) as error:self.client.open(urllib.request.Request(url,data=b'{}',method='POST'),timeout=2)
        self.assertEqual(error.exception.code,405)

    def test_gateway_cannot_serve_private_or_encoded_paths(self):
        for path in ['/../Cargo.toml','/%2e%2e/Cargo.toml','/.local/cargo/config.toml','/api/v1/maintenance/goal']:
            with self.assertRaises(urllib.error.HTTPError) as error:self.client.open(self.base+path,timeout=2)
            self.assertEqual(error.exception.code,404)

    def test_second_owner_and_failed_real_port_never_fall_back_to_fixture(self):
        result=subprocess.run(self.commands[0],env=self.env,cwd=ROOT,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=3)
        self.assertNotEqual(result.returncode,0)
        missing='HATCHERY_NONEXISTENT_PORT' if os.name=='nt' else '/hatchery_nonexistent_serial_port'
        command=[self.commands[0][0],'--rpc',f'127.0.0.1:{free_port()}','--port',missing,'--ids','20']
        result=subprocess.run(command,env=self.env,cwd=ROOT,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=3)
        self.assertNotEqual(result.returncode,0)

    def test_explicit_unassigned_id_never_replaces_joint_mapping(self):
        port=free_port()
        command=[self.commands[0][0],'--rpc',f'127.0.0.1:{port}','--fixture','--ids','1']
        process=subprocess.Popen(command,cwd=ROOT,env=self.env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        try:
            request=json.dumps({'jsonrpc':'2.0','id':9,'token':self.rpc_token,'method':'maintenance.state'}).encode()+b'\n'
            for _ in range(30):
                try:
                    with socket.create_connection(('127.0.0.1',port),timeout=1) as sock:
                        sock.settimeout(1);sock.sendall(request)
                        result=json.loads(sock.makefile('rb').readline(65537))['result']
                    if result['unassigned_devices'][0]['status']=='fixture':break
                except OSError:pass
                time.sleep(.1)
            else:self.fail('Unassigned fixture did not become readable')
            self.assertEqual([r['id'] for r in result['joints']],[20,21,22,23,24,10,11,12,13,14,30,31,32,33,34])
            self.assertTrue(all(r['raw_bytes'] is None for r in result['joints']))
            self.assertIsNone(result['joints'][-1]['policy_index'])
            device=result['unassigned_devices'][0]
            self.assertEqual(device['id'],1)
            self.assertNotIn('runtime_index',device);self.assertNotIn('policy_index',device)
            self.assertTrue(result['fake']);self.assertFalse(result['control_enabled'])
        finally:
            if process.poll() is None:
                process.terminate();process.wait(timeout=3)

if __name__=='__main__':unittest.main(verbosity=2)
