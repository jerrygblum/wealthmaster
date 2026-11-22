"""Check destructive demo reset boundaries with a fake Docker executable only."""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / "demo-nas.sh"
FAKE = r'''
import json, os, sys
from pathlib import Path
args=sys.argv[1:]
mode=os.environ.get("FAKE_MODE","")
with open(os.environ["FAKE_LOG"],"a") as f:f.write(json.dumps(args)+"\n")
if args[0]=="inspect":
    if "compose.service" in args[2]:print("postgres")
    else:print("wealthmaster" if mode=="project" else "wealthmaster-demo")
    sys.exit(0)
if args[:2]==["compose","version"]:sys.exit(0)
if args[0]=="compose":args=args[1:]
while args and args[0] in ("--env-file","-p","-f"):args=args[2:]
if args[:2]==["ps","-q"]:print(args[2]+"-id")
elif args[0]=="exec":
    text=" ".join(args)
    if "POSTGRES_DB" in text:print("wealthmaster/private" if mode=="database" else "wealthmaster_demo/wealthmaster_demo")
    elif "APP_DEMO_ENABLED" in text:
        if mode=="backend":sys.exit(1)
    elif "SELECT CASE" in text:print("refuse" if mode=="marker" else "verified-demo")
    elif "DROP DATABASE" in text and mode=="drop":sys.exit(1)
    elif "CREATE DATABASE" in text and mode=="create":sys.exit(1)
    elif "wget" in text and mode=="health":sys.exit(1)
elif args[0]=="pull" and mode=="pull":sys.exit(1)
sys.exit(0)
'''

class DemoNasTest(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name);self.deploy=self.root/"demo with spaces";self.deploy.mkdir()
        self.bin=self.root/"bin";self.bin.mkdir()
        docker=self.bin/"docker";docker.write_text(f"#!{sys.executable}\n"+FAKE);docker.chmod(0o755)
        sleep=self.bin/"sleep";sleep.write_text("#!/bin/sh\nexit 0\n");sleep.chmod(0o755)
        (self.deploy/".env").write_text("DEMO_POSTGRES_PASSWORD=synthetic-secret\nWEALTHMASTER_IMAGE_TAG=sha-1111111111111111111111111111111111111111\n")
        (self.deploy/"docker-compose.demo.yml").write_text("services: {}\n")
        self.log=self.root/"calls"
        self.env={**os.environ,"PATH":f"{self.bin}:/usr/bin:/bin","FAKE_LOG":str(self.log)}
    def run_demo(self,mode="",action="reset"):
        result=subprocess.run(["sh",str(SCRIPT),action,str(self.deploy)],env={**self.env,"FAKE_MODE":mode},capture_output=True,text=True)
        self.assertNotIn("synthetic-secret",result.stdout+result.stderr)
        return result
    def calls(self):return [" ".join(json.loads(line)) for line in self.log.read_text().splitlines()] if self.log.exists() else []
    def test_reset_verifies_marker_before_stopping_and_never_stops_frontend(self):
        result=self.run_demo();self.assertEqual(0,result.returncode,result.stderr)
        calls=self.calls()
        marker=next(i for i,c in enumerate(calls) if "SELECT CASE" in c)
        stop=next(i for i,c in enumerate(calls) if c.endswith("stop backend"))
        drop=next(i for i,c in enumerate(calls) if "DROP DATABASE wealthmaster_demo" in c)
        create=next(i for i,c in enumerate(calls) if "CREATE DATABASE wealthmaster_demo" in c)
        start=next(i for i,c in enumerate(calls) if c.endswith("start backend"))
        self.assertLess(marker,stop);self.assertLess(stop,drop);self.assertLess(drop,create);self.assertLess(create,start)
        self.assertFalse(any("stop frontend" in c or "down" in c for c in calls))
        self.assertFalse((self.deploy/".demo-operation.lock").exists())
    def test_guards_prevent_database_mutation(self):
        for mode in ("project","database","backend","marker"):
            with self.subTest(mode=mode):
                self.log.unlink(missing_ok=True);self.assertNotEqual(0,self.run_demo(mode).returncode)
                self.assertFalse(any("DROP DATABASE" in c or "stop backend" in c for c in self.calls()))
    def test_drop_or_create_failure_leaves_backend_stopped(self):
        for mode in ("drop","create"):
            self.log.unlink(missing_ok=True);self.assertNotEqual(0,self.run_demo(mode).returncode)
            self.assertTrue(any(c.endswith("stop backend") for c in self.calls()))
            self.assertFalse(any(c.endswith("start backend") for c in self.calls()))
    def test_health_failure_stops_backend_and_returns_failure(self):
        self.assertNotEqual(0,self.run_demo("health").returncode)
        self.assertTrue(self.calls()[-1].endswith("stop backend"))
    def test_lock_prevents_overlapping_reset_or_update(self):
        (self.deploy/".demo-operation.lock").mkdir()
        self.assertNotEqual(0,self.run_demo().returncode);self.assertEqual([],self.calls())
    def test_update_pulls_before_replacement_without_dropping_data(self):
        result=self.run_demo(action="update");self.assertEqual(0,result.returncode,result.stderr)
        calls=self.calls();self.assertFalse(any("DROP DATABASE" in c for c in calls))
        self.assertLess(next(i for i,c in enumerate(calls) if c.endswith("pull backend frontend")),next(i for i,c in enumerate(calls) if c.endswith("stop backend")))
        self.assertTrue(any(c.endswith("--force-recreate frontend") for c in calls))

    def test_update_rejects_mutable_or_ambiguous_image_tags_before_stopping(self):
        for tag in ("latest", "sha-" + "1" * 40 + "\nWEALTHMASTER_IMAGE_TAG=latest"):
            (self.deploy/".env").write_text("WEALTHMASTER_IMAGE_TAG="+tag+"\n")
            self.log.unlink(missing_ok=True)
            self.assertNotEqual(0,self.run_demo(action="update").returncode)
            self.assertFalse(any("stop backend" in c or "pull backend" in c for c in self.calls()))
