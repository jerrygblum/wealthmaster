"""Exercise deployment failure boundaries without touching Docker or real data."""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


SCRIPT = Path(__file__).resolve().parents[1] / "deploy-nas.sh"
OLD = "sha-" + "1" * 40
NEW = "sha-" + "2" * 40
FAKE_DOCKER = r'''
import json, os, sys
from pathlib import Path
args = sys.argv[1:]
mode = os.environ.get("FAKE_MODE", "")
state = Path(os.environ["FAKE_STATE"])
with open(os.environ["FAKE_LOG"], "a") as log:
    log.write(json.dumps({"args": args, "tag": os.environ.get("WEALTHMASTER_IMAGE_TAG")}) + "\n")
if args == ["info"] or args == ["compose", "version"] or args == ["version"]:
    sys.exit(0)
if args[0] == "inspect":
    fmt = args[2]
    if "Config.Image" in fmt:
        for container in args[3:]: print("synthetic:" + container + " old-image-digest")
    elif "Health" in fmt:
        print("running unhealthy" if mode == "health" and state.exists() and "backend" in args[-1] else "running healthy")
    else: print("running")
    sys.exit(0)
if args[0] == "compose": args = args[1:]
# Skip the deployment file, env file and project options.
while args and args[0] in ("--env-file", "-p", "-f"): args = args[2:]
if args[:2] == ["ps", "-q"]: print(args[2] + "-id")
elif args and args[0] == "exec":
    command = " ".join(args)
    if "pg_dump" in command:
        if mode == "backup": sys.exit(1)
        print("synthetic-backup")
    elif "pg_restore" in command:
        archive = sys.stdin.read()
        if mode == "verify" or not archive.strip(): sys.exit(1)
elif args and args[0] == "pull":
    if mode == "pull": sys.exit(1)
elif args and args[0] == "up":
    state.touch()
    if mode == "up": sys.exit(1)
sys.exit(0)
'''


class DeployNasTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.deployment = self.root / "deployment with spaces"
        self.deployment.mkdir()
        self.bin = self.root / "bin"
        self.bin.mkdir()
        docker = self.bin / "docker"
        docker.write_text(f"#!{sys.executable}\n" + FAKE_DOCKER)
        docker.chmod(0o755)
        sleep = self.bin / "sleep"
        sleep.write_text("#!/bin/sh\nexit 0\n")
        sleep.chmod(0o755)
        self.env_text = f"# preserve this comment\nWEALTHMASTER_IMAGE_TAG={OLD}\nMFA_ENCRYPTION_PASSWORD=synthetic-secret\n"
        (self.deployment / ".env").write_text(self.env_text)
        (self.deployment / "docker-compose.prod.yml").write_text("services: {}\n")
        self.env = {**os.environ, "PATH": f"{self.bin}:/usr/bin:/bin",
                    "FAKE_LOG": str(self.root / "calls.jsonl"),
                    "FAKE_STATE": str(self.root / "updated"), "DEPLOY_HEALTH_TIMEOUT": "1"}

    def run_script(self, mode="", tag=NEW):
        result = subprocess.run(["sh", str(SCRIPT), tag, str(self.deployment)],
                                env={**self.env, "FAKE_MODE": mode}, capture_output=True, text=True)
        self.assertNotIn("synthetic-secret", result.stdout + result.stderr)
        return result

    def calls(self):
        path = Path(self.env["FAKE_LOG"])
        return [json.loads(line) for line in path.read_text().splitlines()] if path.exists() else []

    def has_command(self, command):
        return any(command in entry["args"] for entry in self.calls())

    def test_success_verifies_backup_before_updating_and_preserves_secrets(self):
        result = self.run_script()
        self.assertEqual(0, result.returncode, result.stderr)
        self.assertEqual(self.env_text.replace(OLD, NEW), (self.deployment / ".env").read_text())
        backup = next((self.deployment / "backups").iterdir())
        self.assertEqual(self.env_text, (backup / ".env").read_text())
        self.assertTrue((backup / "database.dump").stat().st_size)
        self.assertTrue((backup / "images.txt").exists())
        self.assertEqual(0, (backup.stat().st_mode & 0o077))
        self.assertEqual(0, ((backup / ".env").stat().st_mode & 0o077))
        commands = [" ".join(call["args"]) for call in self.calls()]
        stop = next(i for i,c in enumerate(commands) if c.endswith("stop backend"))
        dump = next(i for i,c in enumerate(commands) if "pg_dump" in c)
        verify = next(i for i,c in enumerate(commands) if "pg_restore" in c)
        pull = next(i for i,c in enumerate(commands) if "pull backend frontend" in c)
        up = next(i for i,c in enumerate(commands) if "up -d --no-deps backend frontend" in c)
        self.assertLess(stop, dump); self.assertLess(dump, verify); self.assertLess(verify, pull); self.assertLess(pull, up)
        self.assertEqual(NEW, self.calls()[pull]["tag"])
        self.assertNotIn("synthetic-secret", json.dumps(self.calls()))
        self.assertFalse((self.deployment / ".deploy.lock").exists())

    def assert_backup_failure(self, mode):
        result = self.run_script(mode)
        self.assertNotEqual(0, result.returncode)
        self.assertFalse(self.has_command("pull")); self.assertFalse(self.has_command("up"))
        self.assertTrue(self.has_command("start"))
        self.assertEqual(self.env_text, (self.deployment / ".env").read_text())

    def test_backup_failure_aborts_and_restarts_old_backend(self):
        self.assert_backup_failure("backup")

    def test_verification_failure_aborts_and_restarts_old_backend(self):
        self.assert_backup_failure("verify")

    def test_pull_failure_keeps_old_env_and_restarts_old_backend(self):
        result = self.run_script("pull")
        self.assertNotEqual(0, result.returncode)
        self.assertFalse(self.has_command("up")); self.assertTrue(self.has_command("start"))
        self.assertEqual(self.env_text, (self.deployment / ".env").read_text())
        self.assertFalse((self.deployment / ".deploy.lock").exists())

    def test_up_failure_keeps_new_env_and_backup_without_automatic_rollback(self):
        result = self.run_script("up")
        self.assertNotEqual(0, result.returncode)
        self.assertIn("No automatic rollback", result.stderr)
        self.assertFalse(self.has_command("start"))
        self.assertIn(NEW, (self.deployment / ".env").read_text())
        self.assertTrue(next((self.deployment / "backups").iterdir()).joinpath("database.dump").exists())

    def test_unhealthy_deployment_is_a_failure(self):
        result = self.run_script("health")
        self.assertNotEqual(0, result.returncode)
        self.assertIn("health did not recover", result.stderr)
        self.assertFalse(self.has_command("start"))

    def test_invalid_tags_and_existing_locks_do_not_mutate_installation(self):
        result = self.run_script(tag="latest")
        self.assertNotEqual(0, result.returncode); self.assertEqual([], self.calls())
        lock = self.deployment / ".deploy.lock"
        lock.mkdir()
        result = self.run_script()
        self.assertNotEqual(0, result.returncode); self.assertTrue(lock.exists())
        self.assertFalse(self.has_command("stop"))

    def test_standalone_compose_is_supported(self):
        standalone = self.bin / "docker-compose"
        standalone.write_text(f"#!{sys.executable}\n" + FAKE_DOCKER)
        standalone.chmod(0o755)
        result = self.run_script()
        self.assertEqual(0, result.returncode, result.stderr)
        self.assertTrue(any(call["args"][0] == "--env-file" for call in self.calls()))


if __name__ == "__main__":
    unittest.main()
