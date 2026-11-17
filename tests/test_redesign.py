import json
import threading
import unittest
import urllib.parse
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]


class DraftHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def log_message(self, *_args):
        pass

    def do_POST(self):
        length = int(self.headers.get('Content-Length', 0))
        params = {key: values[0] for key, values in urllib.parse.parse_qs(self.rfile.read(length).decode('utf-8')).items()}
        payload = json.dumps({
            'type': 'aseta-lead-result',
            'status': 'success',
            'requestId': params.get('request_id'),
            'attemptId': params.get('attempt_id'),
        })
        origin = self.headers.get('Origin') or '*'
        body = f'<!doctype html><script>window.top.parent.postMessage({payload}, "{origin}");</script>'.encode('utf-8')
        self.send_response(200)
        self.send_header('Content-Type', 'text/html; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)


class RedesignDraftTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), DraftHandler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.playwright = sync_playwright().start()
        cls.browser = cls.playwright.chromium.launch(headless=True)

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.playwright.stop()
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()

    def setUp(self):
        self.page = self.browser.new_page()
        self.page.goto(f"http://127.0.0.1:{self.server.server_port}/index.html")

    def tearDown(self):
        self.page.close()

    def test_page_follows_single_end_to_end_journey(self):
        ids = self.page.locator("main > section").evaluate_all(
            "sections => sections.map(section => section.id).filter(Boolean)"
        )
        self.assertEqual(
            ids[:6],
            ["product-overview", "problem-form", "simulator", "results", "faq", "mulai"],
        )

    def test_asset_ranges_are_explicit_and_non_overlapping(self):
        options = self.page.locator("#asset-range option").all_text_contents()
        self.assertEqual(options, ["Pilih rentang aset", "< 50", "50–200", "200–500", "500–1.000", "1.000–2.000"])

    def test_enterprise_features_are_named_choices(self):
        features = self.page.locator("[data-enterprise-feature]")
        self.assertEqual(features.count(), 5)
        self.assertTrue(all(features.nth(i).locator("input[type=checkbox]").count() == 1 for i in range(5)))
        self.assertTrue(all(features.nth(i).locator("small").count() == 1 for i in range(5)))

    def test_implementation_target_is_required(self):
        self.assertEqual(self.page.locator("#implementation-target").get_attribute("required"), "")
        self.assertGreaterEqual(self.page.locator("#implementation-target option").count(), 4)

    def test_lead_form_posts_to_endpoint_before_showing_results(self):
        endpoint = f"http://127.0.0.1:{self.server.server_port}/lead"
        self.page.evaluate("url => document.querySelector('#simulator-lead-form').dataset.leadEndpoint = url", endpoint)
        self.page.locator("#asset-range-summary").select_option("200-499")
        self.page.locator("#result-gate").click()
        self.page.locator('#simulator-lead-form [name="name"]').fill("Uji Coba")
        self.page.locator('#simulator-lead-form [name="email"]').fill("uji@example.com")
        self.page.locator('#simulator-lead-form [name="company"]').fill("PT Uji")
        self.page.locator('#simulator-lead-form [name="position"]').fill("QA")
        self.page.locator('#simulator-lead-form [name="phone"]').fill("081234567890")
        self.page.locator('#simulator-lead-form [name="consent"]').check()
        self.page.locator("#lead-submit").click()
        self.page.wait_for_selector("#results:not([hidden])", timeout=5000)
        self.assertFalse(self.page.evaluate("document.querySelector('#lead-dialog').open"))
        self.assertTrue(self.page.locator("#lead-error").is_hidden())
        self.assertTrue(self.page.locator("#lead-fallback").is_hidden())

    def test_result_download_produces_pdf(self):
        endpoint = f"http://127.0.0.1:{self.server.server_port}/lead"
        self.page.evaluate("url => document.querySelector('#simulator-lead-form').dataset.leadEndpoint = url", endpoint)
        self.page.locator("#asset-range-summary").select_option("200-499")
        self.page.locator("#result-gate").click()
        self.page.locator('#simulator-lead-form [name="name"]').fill("Uji Coba")
        self.page.locator('#simulator-lead-form [name="email"]').fill("uji@example.com")
        self.page.locator('#simulator-lead-form [name="company"]').fill("PT Uji")
        self.page.locator('#simulator-lead-form [name="position"]').fill("QA")
        self.page.locator('#simulator-lead-form [name="phone"]').fill("081234567890")
        self.page.locator('#simulator-lead-form [name="consent"]').check()
        self.page.locator("#lead-submit").click()
        self.page.wait_for_selector("#results:not([hidden])", timeout=5000)
        with self.page.expect_download() as download:
            self.page.locator("#download-result").click()
        with open(download.value.path(), "rb") as handle:
            self.assertEqual(handle.read(5), b"%PDF-")

    def test_mobile_menu_toggles_and_closes_after_navigation(self):
        page = self.browser.new_page(viewport={"width": 390, "height": 844})
        try:
            page.goto(f"http://127.0.0.1:{self.server.server_port}/index.html")
            toggle = page.locator(".menu-toggle")
            nav = page.locator("#main-nav")
            self.assertTrue(toggle.is_visible())
            self.assertFalse(nav.is_visible())
            toggle.click()
            self.assertTrue(nav.is_visible())
            self.assertEqual(toggle.get_attribute("aria-expanded"), "true")
            nav.locator("a", has_text="Simulasi").click()
            self.assertFalse(nav.is_visible())
            self.assertEqual(page.evaluate("location.hash"), "#simulator")
        finally:
            page.close()

    def test_result_cta_opens_lead_form_before_result(self):
        self.page.locator("#result-gate").click()
        self.assertTrue(self.page.locator("#lead-dialog").evaluate("dialog => dialog.open"))
        self.assertTrue(self.page.locator("#results-panel").is_hidden())

    def test_feature_choices_drive_range_estimate(self):
        self.page.locator("#asset-range").select_option("200-499")
        self.page.locator('[data-enterprise-feature="maintenance"] input').check()
        self.page.locator('[data-enterprise-feature="depreciation"] input').check()
        self.assertIn("kisaran", self.page.locator("#investment-output").inner_text().lower())
        self.assertIn("maintenance", self.page.locator("#investment-breakdown").inner_text().lower())

    def test_operational_sliders_update_value_labels_and_estimate(self):
        self.page.locator("#asset-range").select_option("500-999")
        self.page.locator("#problem-identification-form button[type=submit]").click()
        self.page.locator("#dt-range").fill("12")
        self.page.locator("#dtcost-range").fill("2500000")
        self.page.locator("#repair-range").fill("15000000")
        self.page.locator("#reduce-range").fill("30")

        self.assertEqual(self.page.locator("#dt-output").inner_text(), "12 jam")
        self.assertEqual(self.page.locator("#dtcost-output").inner_text(), "Rp2,5 jt")
        self.assertEqual(self.page.locator("#repair-output").inner_text(), "Rp15 jt")
        self.assertEqual(self.page.locator("#reduce-output").inner_text(), "30%")
        self.assertIn("Kisaran", self.page.locator("#investment-output").inner_text())
        self.assertEqual(self.page.locator("#saving-result").inner_text(), "Rp162 jt")

    def test_qr_and_rfid_use_separate_subscription_prices_and_optional_hardware(self):
        self.page.locator("#asset-range").select_option("200-499")
        self.assertFalse(self.page.locator("#qr-hardware").is_checked())
        qr_without_hardware = self.page.locator("#investment-output").inner_text()

        self.page.locator("#subscription-type").select_option("rfid")
        self.assertFalse(self.page.locator("#rfid-hardware").is_checked())
        rfid_without_hardware = self.page.locator("#investment-output").inner_text()
        self.assertNotEqual(qr_without_hardware, rfid_without_hardware)
        self.assertIn("RFID", self.page.locator("#investment-breakdown").inner_text())

        self.page.locator("#rfid-hardware").check()
        rfid_with_hardware = self.page.locator("#investment-output").inner_text()
        self.assertNotEqual(rfid_without_hardware, rfid_with_hardware)

        self.page.locator("#subscription-type").select_option("qr")
        self.page.locator("#qr-hardware").check()
        qr_with_hardware = self.page.locator("#investment-output").inner_text()
        self.assertNotEqual(qr_without_hardware, qr_with_hardware)


if __name__ == "__main__":
    unittest.main()
