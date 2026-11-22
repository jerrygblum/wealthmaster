"""Exercise repository retry behavior without contacting Maven Central."""
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[2] / "backend/docker/mvn-with-retry.sh"


class MavenRetryTest(unittest.TestCase):
    def run_build(self, mode):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            mvn = root / "mvn"
            mvn.write_text('''#!/bin/sh
printf '%s\\n' "$*" >> "$CALLS"
count=$(wc -l < "$CALLS")
case "$MODE" in
    recover) [ "$count" -ge 2 ] && exit 0;;
    success) exit 0;;
    compile) echo '[ERROR] COMPILATION ERROR'; exit 7;;
    missing) echo 'Could not find artifact example:missing:jar:1 in central'; exit 8;;
esac
echo 'Could not transfer artifact example:parent:pom:1 from/to central: status code: 429, reason phrase: Too Many Requests (429)'
exit 9
''')
            mvn.chmod(0o755)
            sleep = root / "sleep"
            sleep.write_text('#!/bin/sh\nprintf "%s\\n" "$1" >> "$DELAYS"\n')
            sleep.chmod(0o755)
            calls, delays = root / "calls", root / "delays"
            result = subprocess.run(
                ["sh", str(SCRIPT), "-q", "-DskipTests", "package"],
                env={**os.environ, "PATH": f"{root}:/usr/bin:/bin", "MODE": mode,
                     "CALLS": str(calls), "DELAYS": str(delays)},
                capture_output=True, text=True,
            )
            return result, calls.read_text().splitlines(), delays.read_text().splitlines() if delays.exists() else []

    def test_success_does_not_retry(self):
        result, calls, delays = self.run_build("success")
        self.assertEqual(0, result.returncode)
        self.assertEqual(["-U -q -DskipTests package"], calls)
        self.assertEqual([], delays)

    def test_rate_limit_recovers_and_forces_resolution(self):
        result, calls, delays = self.run_build("recover")
        self.assertEqual(0, result.returncode)
        self.assertEqual(["-U -q -DskipTests package"] * 2, calls)
        self.assertEqual(["15"], delays)

    def test_persistent_rate_limit_is_bounded_and_preserves_failure(self):
        result, calls, delays = self.run_build("throttle")
        self.assertEqual(9, result.returncode)
        self.assertEqual(3, len(calls))
        self.assertEqual(["15", "30"], delays)

    def test_build_errors_and_missing_artifacts_fail_immediately(self):
        for mode, code in (("compile", 7), ("missing", 8)):
            with self.subTest(mode=mode):
                result, calls, delays = self.run_build(mode)
                self.assertEqual(code, result.returncode)
                self.assertEqual(1, len(calls))
                self.assertEqual([], delays)
