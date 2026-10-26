"""Which issues NSE's bid verification covers, and what a bad run must not do."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sources import nse_bid  # noqa: E402


LIVE = ["BONFIG", "EDELALTS", "FUSIONCX", "JPL", "PARASHLTH"]


class FakeResponse:
    def __init__(self, payload, error=None):
        self._payload = payload
        self._error = error

    def raise_for_status(self):
        if self._error:
            raise self._error

    def json(self):
        if isinstance(self._payload, Exception):
            raise self._payload
        return self._payload


class FakeSession:
    def __init__(self, response):
        self._response = response

    def get(self, *args, **kwargs):
        return self._response


# ---- parse_symbols -------------------------------------------------------

def test_reads_the_bare_array_the_endpoint_returns_today():
    assert nse_bid.parse_symbols(LIVE) == set(LIVE)


def test_reads_the_wrapped_shape_other_nse_endpoints_use():
    assert nse_bid.parse_symbols({"data": ["BONFIG", "JPL"]}) == {"BONFIG", "JPL"}


def test_reads_objects_as_well_as_strings():
    payload = [{"symbol": "BONFIG"}, {"Symbol": "JPL"}]
    assert nse_bid.parse_symbols(payload) == {"BONFIG", "JPL"}


def test_symbols_are_upper_cased_and_trimmed():
    assert nse_bid.parse_symbols([" bonfig ", "jpl"]) == {"BONFIG", "JPL"}


def test_blank_and_unusable_entries_are_dropped():
    assert nse_bid.parse_symbols(["BONFIG", "", "   ", None, 7]) == {"BONFIG"}


def test_an_unexpected_shape_is_empty_rather_than_an_error():
    assert nse_bid.parse_symbols("BONFIG") == set()
    assert nse_bid.parse_symbols(None) == set()


# ---- fetch_symbols -------------------------------------------------------

def test_a_failed_read_is_none_not_empty():
    """None means "we do not know"; empty would mean "NSE covers nothing",
    and writing that off a failed request would withdraw every link."""
    broken = FakeSession(FakeResponse(ValueError("not json")))
    assert nse_bid.fetch_symbols(session=broken) is None


def test_a_list_with_no_symbols_is_also_none():
    assert nse_bid.fetch_symbols(session=FakeSession(FakeResponse([]))) is None


# ---- fetch ---------------------------------------------------------------

def test_matches_rows_on_symbol():
    rows = [
        {"slug": "bonfiglioli", "symbol": "BONFIG"},
        {"slug": "jio", "symbol": "JPL"},
        {"slug": "srit", "symbol": "SRIT"},
    ]
    got = nse_bid.fetch(rows, session=FakeSession(FakeResponse(LIVE)))
    assert got == {"bonfiglioli": True, "jio": True}


def test_matching_ignores_case_and_padding_on_our_side_too():
    rows = [{"slug": "bonfiglioli", "symbol": " bonfig "}]
    got = nse_bid.fetch(rows, session=FakeSession(FakeResponse(LIVE)))
    assert got == {"bonfiglioli": True}


def test_rows_without_a_symbol_are_skipped_not_guessed_from_the_name():
    rows = [{"slug": "bonfiglioli", "symbol": None, "name": "BONFIGLIOLI"}]
    got = nse_bid.fetch(rows, session=FakeSession(FakeResponse(LIVE)))
    assert got == {}


def test_a_failed_run_returns_nothing_so_the_caller_keeps_what_it_had():
    rows = [{"slug": "bonfiglioli", "symbol": "BONFIG"}]
    broken = FakeSession(FakeResponse(ValueError("not json")))
    assert nse_bid.fetch(rows, session=broken) == {}


def test_no_rows_is_not_an_error():
    assert nse_bid.fetch([], session=FakeSession(FakeResponse(LIVE))) == {}
    assert nse_bid.fetch(None, session=FakeSession(FakeResponse(LIVE))) == {}
