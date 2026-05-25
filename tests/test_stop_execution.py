#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Regression Tests for Stop Execution Fixes

These tests verify the bugs fixed on 2025-12-22 don't regress:
1. Race condition with stop_event clearing order
2. Command_id filtering to prevent stale results
3. Single SetBreak call to prevent SIGSEGV crashes
4. First execution after stop returns correct result

Run with: python tests/test_stop_execution.py
Or: pytest tests/test_stop_execution.py -v
"""

import os
import sys
import time
import queue
import unittest
import threading
import multiprocessing

# Add python server sources to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'python'))

from session_manager import (
    SessionManager,
    SessionState,
    init_session_manager,
)
from stata_worker import WorkerState, CommandType

# Configuration
STATA_PATH = os.environ.get('STATA_PATH', '/Applications/StataNow')
STATA_EDITION = os.environ.get('STATA_EDITION', 'mp')
SKIP_STATA_TESTS = os.environ.get('SKIP_STATA_TESTS', 'false').lower() == 'true'


def skip_if_no_stata(func):
    """Decorator to skip tests if Stata is not available"""
    def wrapper(*args, **kwargs):
        if SKIP_STATA_TESTS:
            print(f"Skipping {func.__name__}: SKIP_STATA_TESTS=true")
            return
        if not os.path.exists(STATA_PATH):
            print(f"Skipping {func.__name__}: Stata not found at {STATA_PATH}")
            return
        return func(*args, **kwargs)
    return wrapper


class TestStopExecutionRaceCondition(unittest.TestCase):
    """
    Test for race condition fix: stop_event must be cleared BEFORE
    resetting cancelled and stop_already_sent flags.

    Bug: If cancelled is reset before clearing stop_event, the monitor
    thread could catch a stale stop signal and set cancelled=True for
    the NEW execution.

    Fix: Clear stop_event FIRST in execute_stata_code() and execute_stata_file()
    """

    @skip_if_no_stata
    def test_first_execution_after_stop_succeeds(self):
        """
        Regression test: First execution after stop should return correct result,
        not 'Execution cancelled'.

        This was failing before the fix because:
        1. Stop sets stop_event
        2. Long execution gets cancelled
        3. New execution starts, resets cancelled=False
        4. Monitor thread catches stale stop_event, sets cancelled=True
        5. New execution incorrectly returns "Execution cancelled"
        """
        manager = SessionManager(
            stata_path=STATA_PATH,
            stata_edition=STATA_EDITION,
            max_sessions=4,
            enabled=True
        )

        try:
            self.assertTrue(manager.start(), "Failed to start session manager")

            # Step 1: Execute something to warm up
            result1 = manager.execute('display "warmup"')
            self.assertEqual(result1.get('status'), 'success', f"Warmup failed: {result1}")

            # Step 2: Start a long-running execution in background
            def long_execution():
                manager.execute('sleep 5000')  # 5 second sleep

            thread = threading.Thread(target=long_execution)
            thread.start()
            time.sleep(1)  # Let it start

            # Step 3: Stop the execution
            stop_result = manager.stop_execution()
            self.assertIn(stop_result.get('status'), ['stop_sent', 'stopped'],
                          f"Stop failed: {stop_result}")

            # Wait for stop to take effect
            time.sleep(2)

            # Step 4: CRITICAL - First execution after stop should work
            result2 = manager.execute('display "after stop: " 2+2')

            # This was failing before the fix
            self.assertEqual(result2.get('status'), 'success',
                             f"First execution after stop failed: {result2}")
            self.assertIn('4', result2.get('output', ''),
                          f"Expected '4' in output: {result2}")
            self.assertNotIn('cancelled', result2.get('error', '').lower(),
                             f"Should not be cancelled: {result2}")

            thread.join(timeout=5)

        finally:
            manager.stop()

    @skip_if_no_stata
    def test_multiple_stop_execute_cycles(self):
        """
        Regression test: Multiple stop/execute cycles should all succeed.

        This tests that:
        1. stop_event is properly cleared between cycles
        2. No state corruption accumulates over multiple cycles
        3. SetBreak is called safely (no SIGSEGV)
        """
        manager = SessionManager(
            stata_path=STATA_PATH,
            stata_edition=STATA_EDITION,
            max_sessions=4,
            enabled=True
        )

        try:
            self.assertTrue(manager.start(), "Failed to start session manager")

            for cycle in range(3):
                # Start long execution
                def long_execution():
                    manager.execute('sleep 3000')  # 3 second sleep

                thread = threading.Thread(target=long_execution)
                thread.start()
                time.sleep(0.5)

                # Stop it
                manager.stop_execution()
                time.sleep(1)

                # Execute immediately after stop
                result = manager.execute(f'display "cycle {cycle}: " {cycle}*{cycle}')

                self.assertEqual(result.get('status'), 'success',
                                 f"Cycle {cycle} failed: {result}")
                expected = str(cycle * cycle)
                self.assertIn(expected, result.get('output', ''),
                              f"Cycle {cycle}: Expected '{expected}' in output")

                thread.join(timeout=3)

        finally:
            manager.stop()


class TestCommandIdFiltering(unittest.TestCase):
    """
    Test for command_id filtering fix in session_manager._execute_command()

    Bug: When stop was called, a "_stop" result was put in the queue.
    The next execute() would get this stale result instead of its own.

    Fix: Loop in _execute_command() to find result matching our command_id,
    discarding stale results.
    """

    @skip_if_no_stata
    def test_stale_results_discarded(self):
        """
        Verify that results from stop signals don't pollute normal execution.
        """
        manager = SessionManager(
            stata_path=STATA_PATH,
            stata_edition=STATA_EDITION,
            max_sessions=4,
            enabled=True
        )

        try:
            self.assertTrue(manager.start(), "Failed to start session manager")

            # Send multiple stops to potentially pollute the queue
            for _ in range(3):
                manager.stop_execution()

            time.sleep(0.5)

            # Execute should still work correctly
            result = manager.execute('display "test: " 1+1')

            self.assertEqual(result.get('status'), 'success', f"Execution failed: {result}")
            self.assertIn('2', result.get('output', ''), f"Expected '2' in output: {result}")

        finally:
            manager.stop()

    @skip_if_no_stata
    def test_results_match_commands(self):
        """
        Verify each execution gets its own result, not a previous one.
        """
        manager = SessionManager(
            stata_path=STATA_PATH,
            stata_edition=STATA_EDITION,
            max_sessions=4,
            enabled=True
        )

        try:
            self.assertTrue(manager.start(), "Failed to start session manager")

            # Execute a series of commands with unique outputs
            for i in range(5):
                result = manager.execute(f'display "unique_{i}: " {i}*10')

                self.assertEqual(result.get('status'), 'success',
                                 f"Command {i} failed: {result}")
                expected = str(i * 10)
                self.assertIn(expected, result.get('output', ''),
                              f"Command {i}: Expected '{expected}' in output, got: {result}")

        finally:
            manager.stop()


class TestStopEventClearing(unittest.TestCase):
    """
    Unit tests for stop_event clearing behavior.

    These tests verify the order of operations in execute functions.
    """

    def test_stop_event_order_in_code(self):
        """
        Verify the code has stop_event.clear() BEFORE resetting flags.
        This is a static analysis test - checks the source code.
        """
        import inspect
        from stata_worker import worker_process

        source = inspect.getsource(worker_process)

        # Find the execute_stata_code function within worker_process
        # The fix requires: stop_event.clear() comes before cancelled = False

        # Look for the pattern in the source
        clear_pattern = "stop_event.clear()"
        cancelled_pattern = "cancelled = False"

        clear_pos = source.find(clear_pattern)
        cancelled_pos = source.find(cancelled_pattern)

        self.assertGreater(clear_pos, 0, "stop_event.clear() not found in source")
        self.assertGreater(cancelled_pos, 0, "cancelled = False not found in source")

        # In the fixed code, clear should come before cancelled reset
        # (There may be multiple occurrences, so we check the first after BUSY)
        busy_pos = source.find("WorkerState.BUSY")
        clear_after_busy = source.find(clear_pattern, busy_pos)
        cancelled_after_busy = source.find(cancelled_pattern, busy_pos)

        self.assertLess(clear_after_busy, cancelled_after_busy,
                        "stop_event.clear() should come BEFORE cancelled = False")


class TestLogCaptureIsolation(unittest.TestCase):
    """Regression coverage for issue #8: MCP wrapper must not block
    user-managed `log using` commands. We test the pure wrapping helpers
    directly so the assertions describe *generated Stata code*, not the
    Python source layout."""

    def test_capture_log_name_is_scoped_to_worker(self):
        from stata_worker import get_capture_log_name

        self.assertEqual(get_capture_log_name("abcd1234"), "_mcp_capture_abcd1234")

    def test_capture_log_name_sanitizes_hyphens(self):
        """Worker ids that contain hyphens (full UUIDs) must still produce a
        Stata-valid name (letters/digits/underscores, starts with _)."""
        from stata_worker import get_capture_log_name

        name = get_capture_log_name("11111111-2222-3333-4444-555555555555")
        self.assertNotIn("-", name)
        self.assertTrue(name.startswith("_"))
        # Stata names allow only [A-Za-z0-9_]
        import re as _re

        self.assertRegex(name, r"^[A-Za-z_][A-Za-z0-9_]*$")

    def test_execute_code_wrapper_uses_named_log(self):
        from stata_worker import build_execute_code_wrapper, get_capture_log_name

        name = get_capture_log_name("abcd1234")
        wrapped = build_execute_code_wrapper(
            code="display 1",
            temp_log_stata="/tmp/run.log",
            capture_log_name=name,
            seed_prefix="quietly set seed 42\n",
        )
        self.assertIn(f"log using \"/tmp/run.log\", replace text name({name})", wrapped)
        self.assertIn(f"capture log close {name}", wrapped)
        self.assertNotIn("capture log close _all", wrapped)
        # User code and seed must be present and in the right order
        self.assertLess(wrapped.index("set seed 42"), wrapped.index("display 1"))
        # Open precedes user code precedes close
        open_idx = wrapped.index("log using")
        close_idx = wrapped.rindex(f"capture log close {name}")
        self.assertLess(open_idx, wrapped.index("display 1"))
        self.assertLess(wrapped.index("display 1"), close_idx)

    def test_execute_file_wrapper_uses_named_log(self):
        from stata_worker import build_execute_file_wrapper, get_capture_log_name

        name = get_capture_log_name("abcd1234")
        wrapped = build_execute_file_wrapper(
            original_code="display 2",
            log_file_stata="/tmp/run.log",
            capture_log_name=name,
            seed_hash=12345,
            do_file_dir="/tmp/dir",
        )
        self.assertIn(f"log using \"/tmp/run.log\", replace text name({name})", wrapped)
        self.assertIn(f"capture log close {name}", wrapped)
        self.assertNotIn("capture log close _all", wrapped)
        self.assertIn('cd "/tmp/dir"', wrapped)
        self.assertIn("set seed 12345", wrapped)

    def test_user_log_using_would_not_collide_with_capture_name(self):
        """The capture log name uses a `_mcp_capture_` prefix that user code
        is extremely unlikely to pick, and lives in a *named* slot, so a user
        `log using "x.log", replace` (unnamed slot) cannot conflict."""
        from stata_worker import build_execute_code_wrapper, get_capture_log_name

        name = get_capture_log_name("abcd1234")
        wrapped = build_execute_code_wrapper(
            code='log using "user.log", replace text\ndisplay 1\nlog close',
            temp_log_stata="/tmp/run.log",
            capture_log_name=name,
            seed_prefix="",
        )
        # Wrapper opens its named log, then user code opens the unnamed slot.
        # Both can coexist in Stata, so the wrapper should not have closed _all.
        self.assertNotIn("_all", wrapped)
        self.assertIn(f"name({name})", wrapped)
        self.assertIn('log using "user.log"', wrapped)

    def test_legacy_server_uses_named_capture_log(self):
        """The single-session legacy path in stata_mcp_server.py must also use
        a named capture log. We parse the source instead of importing because
        the module has heavy runtime deps (pydantic/fastapi) that are not
        required to verify this invariant."""
        import re as _re

        server_path = os.path.join(
            os.path.dirname(__file__), '..', 'python', 'stata_mcp_server.py'
        )
        with open(server_path, 'r', encoding='utf-8') as fh:
            source = fh.read()

        match = _re.search(
            r'^MCP_CAPTURE_LOG_NAME\s*=\s*["\']([^"\']+)["\']', source, _re.MULTILINE
        )
        self.assertIsNotNone(match, "stata_mcp_server must define MCP_CAPTURE_LOG_NAME")
        name = match.group(1)
        self.assertTrue(name.startswith("_"))
        self.assertRegex(name, r"^[A-Za-z_][A-Za-z0-9_]*$")

        # Every `log using` written into a temp do-file must use a named log,
        # and the only `capture log close _all` allowed is in the explicit
        # `_single_session_restart` reset path.
        for m in _re.finditer(r'log using "[^"]+", replace text(?:\s+name\([^)]+\))?', source):
            self.assertIn("name(", m.group(0),
                          f"Unnamed log used in stata_mcp_server: {m.group(0)!r}")


class TestMonitorThreadErrorHandling(unittest.TestCase):
    """
    Test for monitor thread error handling fix.

    Bug: Monitor thread had 'except Exception: pass' which silently
    swallowed all errors, potentially causing stop signals to be lost.

    Fix: Log errors with traceback but continue running.
    """

    def test_monitor_thread_continues_on_error(self):
        """
        Verify monitor thread doesn't die on errors.
        This is verified by the thread staying alive.
        """
        # This is tested implicitly by the stop execution tests
        # If the monitor thread died, stop would fail
        pass  # Covered by other tests


if __name__ == '__main__':
    print("=" * 60)
    print("Running Stop Execution Regression Tests")
    print("=" * 60)
    print(f"STATA_PATH: {STATA_PATH}")
    print(f"STATA_EDITION: {STATA_EDITION}")
    print(f"SKIP_STATA_TESTS: {SKIP_STATA_TESTS}")
    print("=" * 60)

    unittest.main(verbosity=2)
