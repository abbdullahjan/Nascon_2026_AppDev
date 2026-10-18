"""
conftest.py — shared fixtures for the Appium 2 test suite.

Requirements:
    pip install Appium-Python-Client pytest requests selenium

Environment variables (override defaults for your setup):
    APPIUM_URL        Appium 2 server URL            default: http://localhost:4723
    BACKEND_URL       Backend API base URL           default: http://localhost:8080
    SELENIUM_HUB_URL  Selenium Grid 4 hub URL        default: http://localhost:4444
    ANDROID_APK_PATH  Path to the built APK          default: (skip install)
    ANDROID_APP_ID    App package name               default: com.nascon26.app
    DEVICE_UDID       ADB device UDID                default: auto-detect
"""

import os
import time
import pytest
import requests

# ── Config from env ───────────────────────────────────────────────────────────
APPIUM_URL       = os.environ.get("APPIUM_URL",       "http://localhost:4723")
BACKEND_URL      = os.environ.get("BACKEND_URL",      "http://localhost:8080")
SELENIUM_HUB_URL = os.environ.get("SELENIUM_HUB_URL", "http://localhost:4444")
ANDROID_APP_ID   = os.environ.get("ANDROID_APP_ID",   "com.nascon26.app")
DEVICE_UDID      = os.environ.get("DEVICE_UDID",      None)
APK_PATH         = os.environ.get("ANDROID_APK_PATH", None)


# ── Appium driver fixture ──────────────────────────────────────────────────────
@pytest.fixture(scope="module")
def appium_driver():
    """
    Start an Appium 2 Android session.
    Yields the driver, then quits after the module finishes.
    """
    from appium import webdriver as appium_webdriver
    from appium.options import AppiumOptions

    options = AppiumOptions()
    options.platform_name   = "Android"
    options.automation_name = "UiAutomator2"
    options.app_package     = ANDROID_APP_ID
    options.app_activity    = f"{ANDROID_APP_ID}.MainActivity"
    options.no_reset        = True   # keep app data between tests in the same module

    if DEVICE_UDID:
        options.udid = DEVICE_UDID
    if APK_PATH:
        options.app = APK_PATH

    driver = appium_webdriver.Remote(
        command_executor=f"{APPIUM_URL}/wd/hub",
        options=options,
    )
    driver.implicitly_wait(5)
    yield driver
    driver.quit()


# ── Selenium Chrome driver fixture (for cross-surface test) ───────────────────
@pytest.fixture(scope="module")
def chrome_driver():
    """
    Open a Chrome session on the Selenium Grid 4 hub.
    Used for the cross-surface integration test.
    """
    from selenium import webdriver as selenium_webdriver
    from selenium.webdriver.chrome.options import Options

    opts = Options()
    opts.add_argument("--headless")
    opts.add_argument("--no-sandbox")
    opts.add_argument("--disable-dev-shm-usage")

    driver = selenium_webdriver.Remote(
        command_executor=f"{SELENIUM_HUB_URL}/wd/hub",
        options=opts,
    )
    driver.implicitly_wait(10)
    yield driver
    driver.quit()


# ── Helpers ────────────────────────────────────────────────────────────────────
def reset_backend():
    """POST /audit/v1/reset to ensure deterministic seed state."""
    resp = requests.post(f"{BACKEND_URL}/audit/v1/reset", json={}, timeout=30)
    assert resp.status_code == 200, f"Reset failed: {resp.status_code} {resp.text}"


def post_score_event(event_id: str, match_id: str = "match-m1"):
    """POST a score event and return the response."""
    return requests.post(
        f"{BACKEND_URL}/audit/v1/events",
        json={
            "event_id": event_id,
            "match_id": match_id,
            "type":     "score",
            "payload":  {"team_id": "club-alpha-1", "event_type": "goal"},
        },
        timeout=10,
    )
