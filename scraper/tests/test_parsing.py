"""Unit tests for parsing and the manual-lock protection."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import config  # noqa: E402
import db  # noqa: E402
import util  # noqa: E402
from sources import gmp, listing, nse, prices, timetable  # noqa: E402


# --------------------------------------------------------------------------
# util
# --------------------------------------------------------------------------
def test_slugify():
    assert util.slugify("Gaja Alternative Asset Management Limited") == (
        "gaja-alternative-asset-management-limited"
    )


def test_short_name_strips_legal_suffix():
    assert util.short_name("Acme Industries Limited") == "Acme Industries"
    assert util.short_name("Acme Industries Ltd.") == "Acme Industries"


def test_to_float_handles_messy_input():
    assert util.to_float("Rs.402") == 402.0
    assert util.to_float("₹12,500") == 12500.0
    assert util.to_float("2.5328946E7") == 25328946.0
    assert util.to_float("") is None
    assert util.to_float(None) is None


def test_to_date_formats():
    assert util.to_date("19-Aug-2026") == "2026-08-19"
    assert util.to_date("2026-08-19") == "2026-08-19"
    assert util.to_date("19-08-2026") == "2026-08-19"
    assert util.to_date("19-Aug-2026 to 21-Aug-2026") == "2026-08-19"
    assert util.to_date("") is None


def test_parse_price_band():
    assert util.parse_price_band("Rs.152 to Rs.160") == (152.0, 160.0)
    assert util.parse_price_band("Rs. 152 to Rs. 160 per Equity Share") == (152.0, 160.0)
    assert util.parse_price_band("Rs.100") == (100.0, 100.0)
    assert util.parse_price_band(None) == (None, None)


def test_parse_lot_size():
    assert util.parse_lot_size("93 Equity Shares and in multiples thereof") == 93
    assert util.parse_lot_size("1,200 Equity Shares") == 1200
    assert util.parse_lot_size(None) is None


def test_derive_status():
    assert util.derive_status("2026-08-19", "2026-08-21", None, today="2026-08-20") == "open"
    assert util.derive_status("2026-08-19", "2026-08-21", None, today="2026-08-18") == "upcoming"
    assert util.derive_status("2026-08-19", "2026-08-21", None, today="2026-08-25") == "closed"
    assert util.derive_status("2026-08-19", "2026-08-21", "2026-08-26", today="2026-08-27") == "listed"


# --------------------------------------------------------------------------
# NSE source
# --------------------------------------------------------------------------
NSE_LIST_ROW = {
    "companyName": "Gaja Alternative Asset Management Limited",
    "issueEndDate": "21-Aug-2026",
    "issuePrice": "Rs.152 to Rs.160",
    "issueSize": "25328946",
    "issueStartDate": "19-Aug-2026",
    "series": "EQ",
    "status": "Active",
    "symbol": "GAJA",
    "noOfTime": "0.502364093634216",
}

NSE_DETAIL = {
    "issueInfo": {
        "dataList": [
            {"title": "Symbol", "value": "GAJA"},
            {"title": "Price Range", "value": "Rs. 152 to Rs. 160 per Equity Share"},
            {"title": "Face Value", "value": "Rs. 5 per Equity Share"},
            {"title": "Bid Lot", "value": "93 Equity Shares and in multiples thereof"},
            {"title": "Issue Size", "value": '"Fresh Issue aggregating up to Rs. 4,500 million"'},
        ]
    }
}

NSE_CATEGORY = {
    "dataList": [
        {"category": "Category", "noOfTotalMeant": "No. of times"},
        {"category": "Qualified Institutional Buyers(QIBs)", "noOfTotalMeant": "0.09124148108843086"},
        {"category": "Non Institutional Investors", "noOfTotalMeant": "1.5926609711721422"},
        {"category": "Retail Individual Investors(RIIs)", "noOfTotalMeant": "2.4501"},
        {"category": "Total", "noOfTotalMeant": "0.7943609227418543"},
    ]
}


def test_normalize_list_item():
    row = nse.normalize_list_item(NSE_LIST_ROW)
    assert row["slug"] == "gaja-alternative-asset-management-limited"
    assert row["symbol"] == "GAJA"
    assert row["board"] == "Mainboard"
    # Whatever today is, the status must agree with the ladder rather than
    # with NSE's own "Active" flag — asserting a fixed value here is what let
    # the flag-beats-dates bug live in the first place.
    assert row["status"] == util.derive_status(
        row["open_date"], row["close_date"], None
    )
    assert row["price_band_low"] == 152.0
    assert row["price_band_high"] == 160.0
    assert row["open_date"] == "2026-08-19"
    assert row["close_date"] == "2026-08-21"
    assert row["issue_size_shares"] == 25328946
    assert row["subscription_total"] == 0.502364093634216


def test_normalize_list_item_detects_sme():
    row = nse.normalize_list_item({**NSE_LIST_ROW, "series": "SME"})
    assert row["board"] == "SME"


def test_parse_detail_extracts_lot_size():
    fields = nse.parse_detail(NSE_DETAIL)
    assert fields["lot_size"] == 93
    assert fields["face_value"] == 5.0
    assert fields["price_band_low"] == 152.0
    assert fields["price_band_high"] == 160.0
    assert fields["min_investment"] == 93 * 160
    assert "Fresh Issue" in fields["issue_size"]


def test_parse_detail_empty_is_safe():
    assert nse.parse_detail({}) == {}
    assert nse.parse_detail(None) == {}


def test_parse_subscription():
    subs = nse.parse_subscription(NSE_CATEGORY)
    assert subs["subscription_qib"] == 0.09
    assert subs["subscription_nii"] == 1.59
    assert subs["subscription_retail"] == 2.45
    assert subs["subscription_total"] == 0.79


# --------------------------------------------------------------------------
# Manual-lock protection — the core safety guarantee
# --------------------------------------------------------------------------
def test_locked_columns_are_never_written():
    rows = [{"slug": "acme", "name": "Acme", "gmp": 50, "lot_size": 100}]
    existing = {"acme": {"locked": ["gmp"], "gmp": 77}}
    payload = db.apply_locks(rows, existing)[0]
    assert "gmp" not in payload          # locked -> preserved in the database
    assert payload["lot_size"] == 100    # unlocked -> updated normally


def test_manual_jsonb_is_never_written():
    rows = [{"slug": "acme", "name": "Acme", "manual": {"about": "hacked"}, "locked": ["x"]}]
    payload = db.apply_locks(rows, {})[0]
    assert "manual" not in payload
    assert "locked" not in payload


def test_empty_values_do_not_blank_existing_data():
    rows = [{"slug": "acme", "name": "Acme", "gmp": None, "registrar": None}]
    payload = db.apply_locks(rows, {})[0]
    assert "gmp" not in payload
    assert "registrar" not in payload
    assert payload["name"] == "Acme"


def test_internal_underscore_fields_stripped():
    rows = [{"slug": "acme", "name": "Acme", "_series": "EQ"}]
    payload = db.apply_locks(rows, {})[0]
    assert "_series" not in payload


# --------------------------------------------------------------------------
# GMP parsing
# --------------------------------------------------------------------------
GMP_HTML = """
<table>
  <tr><th>IPO Name</th><th>GMP</th><th>Price</th></tr>
  <tr><td>Gaja Alternative Asset Management</td><td>62</td><td>160</td></tr>
  <tr><td>Metalic Technoforge SME</td><td>-4</td><td>77</td></tr>
  <tr><td>Not An Ipo Row</td><td>some text</td><td>x</td></tr>
</table>
"""


def test_parse_gmp_table():
    result = gmp.parse_gmp_table(GMP_HTML)
    assert result["gaja-alternative-asset-management"] == 62.0
    assert result["metalic-technoforge"] == -4.0
    assert "not-an-ipo-row" not in result


def test_match_to_ipos_uses_prefix_when_names_differ():
    scraped = {"gaja-alternative-asset-management": 62.0}
    rows = [{"slug": "gaja-alternative-asset-management-limited"}]
    assert gmp.match_to_ipos(scraped, rows) == {
        "gaja-alternative-asset-management-limited": 62.0
    }


def test_gmp_disabled_returns_empty(monkeypatch):
    monkeypatch.setattr(gmp.config, "GMP_SOURCE", "none")
    assert gmp.fetch([{"slug": "x"}]) == {}


NSE_SME_DETAIL = {
    "issueInfo": {
        "dataList": [
            {"title": "Symbol", "value": "SUMAX"},
            {"title": "Price Range", "value": "Rs. 95 to Rs. 101 per Equity Share"},
            {"title": "Lot Size", "value": "1200 Equity Shares"},
            {"title": "Face Value", "value": "Rs. 10 per Equity Share"},
            {"title": "Book Running Lead Managers", "value": "Alpha Capital, Beta Securities and Gamma Advisors"},
        ]
    }
}


def test_parse_detail_sme_uses_lot_size_title():
    """SME issues label the lot 'Lot Size', mainboard uses 'Bid Lot'."""
    fields = nse.parse_detail(NSE_SME_DETAIL)
    assert fields["lot_size"] == 1200
    assert fields["face_value"] == 10.0
    assert fields["min_investment"] == 1200 * 101


def test_parse_detail_extracts_lead_managers():
    fields = nse.parse_detail(NSE_SME_DETAIL)
    assert fields["lead_managers"] == [
        "Alpha Capital", "Beta Securities", "Gamma Advisors"
    ]


# --------------------------------------------------------------------------
# PostgREST bulk-upsert shape grouping
# --------------------------------------------------------------------------
def test_group_by_shape_splits_differing_key_sets():
    """PostgREST rejects a bulk insert whose objects have different keys."""
    rows = [
        {"slug": "a", "name": "A", "gmp": 10},        # has gmp
        {"slug": "b", "name": "B"},                    # gmp locked or empty
        {"slug": "c", "name": "C", "gmp": 5},          # has gmp
    ]
    groups = db.group_by_shape(rows)
    assert len(groups) == 2
    sizes = sorted(len(g) for g in groups)
    assert sizes == [1, 2]
    for group in groups:
        keys = {tuple(sorted(r.keys())) for r in group}
        assert len(keys) == 1, "every row in a batch must share one key set"


def test_group_by_shape_single_batch_when_uniform():
    rows = [{"slug": "a", "name": "A"}, {"slug": "b", "name": "B"}]
    assert len(db.group_by_shape(rows)) == 1


def test_group_by_shape_empty():
    assert db.group_by_shape([]) == []


def test_apply_locks_then_group_produces_valid_batches():
    """End-to-end: the real pipeline path must never emit a mixed batch."""
    rows = [
        {"slug": "a", "name": "A", "gmp": 10, "lot_size": 100},
        {"slug": "b", "name": "B", "gmp": 20, "lot_size": None},   # empty lot
        {"slug": "c", "name": "C", "gmp": 30, "lot_size": 300},
    ]
    existing = {"a": {"locked": ["gmp"], "gmp": 99}}               # a locks gmp
    payload = db.apply_locks(rows, existing)
    for group in db.group_by_shape(payload):
        keys = {tuple(sorted(r.keys())) for r in group}
        assert len(keys) == 1


# --------------------------------------------------------------------------
# Locked GMP must drive every derived value (regression: derived fields were
# computed from the scraped GMP before locks were applied)
# --------------------------------------------------------------------------
import pipeline  # noqa: E402


def test_effective_gmp_prefers_locked_stored_value():
    row = {"slug": "a", "gmp": 50}
    existing = {"locked": ["gmp"], "gmp": 77}
    assert pipeline.effective_gmp(row, existing) == 77


def test_effective_gmp_uses_scraped_when_not_locked():
    row = {"slug": "a", "gmp": 50}
    existing = {"locked": [], "gmp": 77}
    assert pipeline.effective_gmp(row, existing) == 50


def test_effective_gmp_falls_back_to_stored_when_scraper_has_none():
    row = {"slug": "a", "gmp": None}
    existing = {"locked": [], "gmp": 77}
    assert pipeline.effective_gmp(row, existing) == 77


def test_effective_gmp_none_when_nothing_known():
    assert pipeline.effective_gmp({"slug": "a"}, None) is None


def test_estimated_listing_uses_locked_gmp_not_scraped():
    """A hand-maintained GMP must not disagree with the listing estimate."""
    row = {"slug": "a", "gmp": 50, "price_band_high": 100, "lot_size": 10}
    existing = {"locked": ["gmp"], "gmp": 77}
    value = pipeline.effective_gmp(row, existing)
    pipeline.compute_derived(row, value)
    assert row["estimated_listing"] == 177    # 100 + 77, not 100 + 50
    assert row["min_investment"] == 1000


def test_compute_derived_without_gmp_leaves_estimate_unset():
    row = {"slug": "a", "price_band_high": 100, "lot_size": 10}
    pipeline.compute_derived(row, None)
    assert "estimated_listing" not in row


# --------------------------------------------------------------------------
# Negative GMP parsing (regression: only a bare leading '-' was handled)
# --------------------------------------------------------------------------
def test_parse_gmp_table_handles_negative_formats():
    html = """
    <table>
      <tr><th>IPO Name</th><th>GMP</th></tr>
      <tr><td>Alpha Industries</td><td>-4</td></tr>
      <tr><td>Beta Metals</td><td>- 7</td></tr>
      <tr><td>Gamma Foods</td><td>-Rs. 12</td></tr>
      <tr><td>Delta Mills</td><td>Rs. -15</td></tr>
      <tr><td>Epsilon Corp</td><td>+9</td></tr>
      <tr><td>Zeta Tech</td><td>Rs.1,250</td></tr>
    </table>
    """
    result = gmp.parse_gmp_table(html)
    assert result["alpha-industries"] == -4.0
    assert result["beta-metals"] == -7.0
    assert result["gamma-foods"] == -12.0
    assert result["delta-mills"] == -15.0
    assert result["epsilon-corp"] == 9.0
    assert result["zeta-tech"] == 1250.0


def test_match_to_ipos_skips_ambiguous_prefixes():
    """Two companies sharing an opening must not inherit each other's GMP."""
    scraped = {
        "sumax-engineering-limited": 20.0,
        "sumax-engineering-services": 55.0,
    }
    rows = [{"slug": "sumax-engineering-industries-limited"}]
    assert gmp.match_to_ipos(scraped, rows) == {}


def test_match_to_ipos_exact_slug_wins_over_prefix():
    scraped = {"acme-industries-limited": 12.0, "acme-industries-services": 99.0}
    rows = [{"slug": "acme-industries-limited"}]
    assert gmp.match_to_ipos(scraped, rows) == {"acme-industries-limited": 12.0}


def test_match_to_ipos_unique_prefix_still_matches():
    scraped = {"gaja-alternative-asset-management": 62.0}
    rows = [{"slug": "gaja-alternative-asset-management-limited"}]
    assert gmp.match_to_ipos(scraped, rows) == {
        "gaja-alternative-asset-management-limited": 62.0
    }


# --------------------------------------------------------------------------
# Locking a source column must also hold back its derived columns
# --------------------------------------------------------------------------
def test_expand_locks_includes_derived_columns():
    assert db.expand_locks(["gmp"]) == {"gmp", "estimated_listing", "gmp_updated_at"}
    assert db.expand_locks(["lot_size"]) == {"lot_size", "min_investment"}
    assert db.expand_locks([]) == set()
    assert db.expand_locks(None) == set()


def test_locked_gmp_also_withholds_estimated_listing():
    """A pinned GMP must not sit beside an estimate derived from a different one."""
    rows = [{
        "slug": "a", "name": "A",
        "gmp": 50, "estimated_listing": 210, "gmp_updated_at": "2026-08-20T00:00:00Z",
        "price_band_high": 160,
    }]
    existing = {"a": {"locked": ["gmp"], "gmp": 77}}
    payload = db.apply_locks(rows, existing)[0]
    assert "gmp" not in payload
    assert "estimated_listing" not in payload
    assert "gmp_updated_at" not in payload
    assert payload["price_band_high"] == 160


def test_locked_lot_size_also_withholds_min_investment():
    """min_investment is computed in nse.parse_detail too, so it must be covered."""
    rows = [{"slug": "a", "name": "A", "lot_size": 93, "min_investment": 14880}]
    existing = {"a": {"locked": ["lot_size"]}}
    payload = db.apply_locks(rows, existing)[0]
    assert "lot_size" not in payload
    assert "min_investment" not in payload


def test_unlocked_row_keeps_all_derived_columns():
    rows = [{
        "slug": "a", "name": "A", "gmp": 50,
        "estimated_listing": 210, "lot_size": 93, "min_investment": 14880,
    }]
    payload = db.apply_locks(rows, {})[0]
    for column in ("gmp", "estimated_listing", "lot_size", "min_investment"):
        assert column in payload


# --------------------------------------------------------------------------
# GMP column detection (regression: first numeric cell after the name was
# taken, so a price or lot-size column could be stored as the premium)
# --------------------------------------------------------------------------
GMP_HTML_PRICE_FIRST = """
<table>
  <tr><th>IPO Name</th><th>Price</th><th>Lot</th><th>GMP (₹)</th><th>GMP %</th></tr>
  <tr><td>Alpha Industries</td><td>160</td><td>93</td><td>34</td><td>21.3%</td></tr>
  <tr><td>Beta Metals</td><td>101</td><td>1200</td><td>-7</td><td>-6.9%</td></tr>
</table>
"""


def test_parse_gmp_table_uses_header_not_first_numeric_cell():
    result = gmp.parse_gmp_table(GMP_HTML_PRICE_FIRST)
    assert result["alpha-industries"] == 34.0     # not 160 (price) or 93 (lot)
    assert result["beta-metals"] == -7.0


def test_find_gmp_column_ignores_percentage_and_gain_columns():
    from bs4 import BeautifulSoup
    soup = BeautifulSoup(GMP_HTML_PRICE_FIRST, "html.parser")
    assert gmp._find_gmp_column(soup) == 3


def test_parse_gmp_table_falls_back_when_no_header():
    html = """
    <table>
      <tr><td>Alpha Industries</td><td>34</td></tr>
    </table>
    """
    assert gmp.parse_gmp_table(html)["alpha-industries"] == 34.0


# --------------------------------------------------------------------------
# Lock hygiene
# --------------------------------------------------------------------------
def test_identity_columns_cannot_be_locked():
    """Locking slug/name would strip the PK and fail the whole batch."""
    rows = [{"slug": "a", "name": "A", "gmp": 10}]
    existing = {"a": {"locked": ["slug", "name"]}}
    payload = db.apply_locks(rows, existing)[0]
    assert payload["slug"] == "a"
    assert payload["name"] == "A"


def test_unknown_lock_names_are_ignored_not_silently_trusted():
    rows = [{"slug": "a", "name": "A", "gmp": 10}]
    existing = {"a": {"locked": ["GMP", " gmp", "nonsense"]}}   # typos
    payload = db.apply_locks(rows, existing)[0]
    assert payload["gmp"] == 10          # none of those matched the real column


def test_empty_strings_do_not_blank_existing_data():
    rows = [{"slug": "a", "name": "A", "registrar": "", "lead_managers": []}]
    payload = db.apply_locks(rows, {})[0]
    assert "registrar" not in payload
    assert "lead_managers" not in payload


# --------------------------------------------------------------------------
# Listing status promotion
# --------------------------------------------------------------------------
def test_status_reaches_listed_using_stored_listing_date():
    row = {"slug": "a", "status": "closed"}
    existing = {"listing_date": "2026-08-18"}
    pipeline.apply_status(row, existing, today="2026-08-20")
    assert row["status"] == "listed"


def test_status_not_promoted_before_listing_date():
    row = {"slug": "a", "status": "closed"}
    existing = {"listing_date": "2026-08-25"}
    pipeline.apply_status(row, existing, today="2026-08-20")
    assert row["status"] == "closed"


def test_status_promotion_noop_without_listing_date():
    row = {"slug": "a", "status": "closed"}
    pipeline.apply_status(row, None, today="2026-08-20")
    assert row["status"] == "closed"


def test_locked_listing_date_does_not_leak_into_status():
    """A lock must hold back the conclusion, not just the evidence.

    apply_locks correctly strips a locked listing_date from the payload. If
    the status computed from that rejected value were still written, the lock
    would protect the column and publish its consequence anyway.
    """
    row = {"slug": "f", "name": "F", "status": "closed",
           "listing_date": "2026-08-20"}
    existing = {"locked": ["listing_date"], "listing_date": None}
    pipeline.apply_status(row, existing, today="2026-08-26")
    assert row["status"] == "closed"

    payload = db.apply_locks([dict(row)], {"f": existing})[0]
    assert "listing_date" not in payload
    assert payload["status"] == "closed"


def test_non_iso_future_listing_date_does_not_promote():
    """Status is decided by comparing date strings.

    '01/09/2026' sorts before today's '2026-08-26', so an unnormalised value
    would promote an IPO that lists next month — and nothing demotes it.
    """
    for value in ("01/09/2026", "15-Sep-2026", "1st Sep 2026"):
        row = {"slug": "x", "status": "closed", "listing_date": value}
        pipeline.apply_status(row, None, today="2026-08-26")
        assert row["status"] == "closed", f"{value} wrongly promoted"


def test_listing_date_is_normalised_to_iso_before_storage():
    row = {"slug": "x", "status": "closed", "listing_date": "1st Sep 2026"}
    pipeline.apply_status(row, None, today="2026-08-26")
    assert row["listing_date"] == "2026-09-01"


# --------------------------------------------------------------------------
# GMP history must contain only premiums we actually observed
# --------------------------------------------------------------------------
def test_stale_gmp_is_not_recorded_as_observed():
    """A dead source must leave a gap in the chart, not a flat line.

    effective_gmp deliberately falls back to the stored value so derived
    fields stay consistent with what the site shows. Appending that value to
    gmp_history would record yesterday's premium as if seen today.
    """
    row = {"slug": "a"}
    existing = {"locked": [], "gmp": 42}
    assert pipeline.effective_gmp(row, existing) == 42
    assert pipeline.gmp_is_observed(row, existing) is False


def test_scraped_gmp_is_observed():
    assert pipeline.gmp_is_observed({"slug": "a", "gmp": 12.0}, {"locked": []})


def test_locked_gmp_counts_as_observed_every_run():
    """A hand-maintained premium is authoritative, so it keeps its trend."""
    assert pipeline.gmp_is_observed({"slug": "a"}, {"locked": ["gmp"], "gmp": 7})


# --------------------------------------------------------------------------
# IPOs NSE has stopped listing
# --------------------------------------------------------------------------
def test_carried_row_cannot_blank_stored_columns():
    """A skeleton row for an IPO NSE dropped must only ever ADD.

    These rows are re-introduced so their timetable can be filled in and so
    they can still reach 'listed'. They carry almost no fields, so the danger
    is the opposite of the usual one: an over-eager payload would wipe the
    price band, lot size and GMP already stored for that IPO.
    """
    carried = {
        "slug": "tempsens",
        "name": "Tempsens Instruments (India) Limited",
        "status": "closed",
        "updated_at": "2026-08-26T06:00:00+00:00",
    }
    payload = db.apply_locks([dict(carried)], {})[0]
    assert set(payload) == {"slug", "name", "status", "updated_at"}
    for column in ("gmp", "price_band_high", "lot_size", "subscription_total"):
        assert column not in payload


def test_carried_row_still_reaches_listed():
    """The whole point: promotion works for an IPO NSE no longer returns."""
    carried = {"slug": "tempsens", "name": "Tempsens", "status": "closed"}
    existing = {"locked": [], "listing_date": "2026-08-28"}
    pipeline.apply_status(carried, existing, today="2026-08-28")
    assert carried["status"] == "listed"


# --------------------------------------------------------------------------
# Timetable source
# --------------------------------------------------------------------------
def test_timetable_skips_ipos_that_already_have_everything():
    """Steady state must cost zero requests."""
    complete = {column: "2026-08-28" for column in timetable.COLUMNS}
    complete["locked"] = []
    assert timetable._missing_columns(complete) == set()


def test_timetable_ignores_locked_columns():
    """Spending a request on a value apply_locks will discard is waste."""
    existing = {"locked": ["registrar"], "registrar": None}
    assert "registrar" not in timetable._missing_columns(existing)


def test_timetable_reports_every_missing_column():
    assert timetable._missing_columns({"locked": []}) == set(timetable.COLUMNS)


def test_flight_payload_survives_escaped_quotes():
    """Chunks are JS string literals; a naive quote scan truncates them."""
    html = (
        'self.__next_f.push([1,"{\\"a\\":\\"one\\"}"])'
        'self.__next_f.push([1,"{\\"b\\":\\"two\\"}"])'
    )
    assert timetable.flight_payload(html) == '{"a":"one"}{"b":"two"}'


def test_json_string_reads_escaped_values():
    text = '"registrar_name":"MUFG \\"Intime\\" Ltd."'
    assert timetable.json_string(text, "registrar_name") == 'MUFG "Intime" Ltd.'


def test_json_string_missing_key_is_none():
    assert timetable.json_string('{"a":"1"}', "registrar_name") is None


def test_parse_registrar_prefers_the_website_link():
    """Phone and email rows carry anchors too; the label disambiguates."""
    info = (
        '<strong>MUFG</strong><br><strong>Website:</strong> '
        '<a href=\\"https://in.mpms.mufg.com/x.html\\">site</a><br>'
        '<strong>Email:</strong> <a href=\\"mailto:a@b.com\\">a@b.com</a>'
    )
    flight = f'"registrar_name":"MUFG Intime India Pvt.Ltd.","registrar_basic_info":"{info}"'
    name, url = timetable.parse_registrar(flight)
    assert name == "MUFG Intime India Pvt.Ltd."
    assert url == "https://in.mpms.mufg.com/x.html"


def test_fetch_detail_refuses_paths_pointing_at_another_host():
    """The path comes from a third party, so it must not choose the host."""
    source = {"base_url": "https://www.investorgain.com",
              "referer": "r", "origin": "o"}
    for path in ("//evil.example/x", "https://evil.example/x", "gmp/x/1/", "", None):
        assert timetable._fetch_detail(source, path) == {}


# --------------------------------------------------------------------------
# Real-world page shape (ipowatch): td-based headers, and a history table
# whose column order is Name | PRICE | GMP — the price must not be taken as GMP
# --------------------------------------------------------------------------
IPOWATCH_LIKE = """
<table>
  <tr><td>IPO Name</td><td>IPO GMP*</td><td>Trend</td><td>Price Band</td><td>Est. Listing</td></tr>
  <tr><td>Tempsens Instruments</td><td>\u20b9290</td><td>\U0001f534</td><td>\u20b9300</td><td>\u20b9590 (96.67%)</td></tr>
  <tr><td>Madhur Knit Crafts</td><td>\u20b90</td><td>\U0001f7e1</td><td>\u20b9100</td><td>\u20b9- (0.00%)</td></tr>
</table>
<table>
  <tr><td>IPO Name</td><td>IPO Price</td><td>IPO GMP</td><td>Listing Price</td></tr>
  <tr><td></td><td></td><td></td><td></td></tr>
  <tr><td>Ardee Industries</td><td>\u20b953</td><td>\u20b917</td><td>\u20b972</td></tr>
  <tr><td>Tempsens Instruments</td><td>\u20b9300</td><td>\u20b9999</td><td>\u20b91</td></tr>
</table>
"""


def test_td_header_rows_are_recognised():
    result = gmp.parse_gmp_table(IPOWATCH_LIKE)
    assert result["tempsens-instruments"] == 290.0
    assert result["madhur-knit-crafts"] == 0.0


def test_history_table_uses_gmp_column_not_price():
    result = gmp.parse_gmp_table(IPOWATCH_LIKE)
    assert result["ardee-industries"] == 17.0          # not 53 (the price)


def test_first_table_wins_on_duplicate_company():
    """Live table precedes history table; the live value must be kept."""
    result = gmp.parse_gmp_table(IPOWATCH_LIKE)
    assert result["tempsens-instruments"] == 290.0     # not 999 from table 2


def test_ipowatch_is_a_configured_source():
    assert "ipowatch" in config.GMP_SOURCES
    assert config.GMP_SOURCES["ipowatch"]["base_url"].startswith("https://ipowatch.in")


# --------------------------------------------------------------------------
# investorgain JSON GMP parsing + multi-source order
# --------------------------------------------------------------------------
def test_parse_investorgain_gmp():
    assert gmp.parse_investorgain_gmp('&#8377;<b>25</b> (30.12%)<br>x') == 25.0
    assert gmp.parse_investorgain_gmp('₹<b>-4</b> (-2.6%)') == -4.0
    assert gmp.parse_investorgain_gmp('₹<b>1,250</b> (5%)') == 1250.0
    assert gmp.parse_investorgain_gmp('&#8377;<b>--</b> (0.00%)') is None
    assert gmp.parse_investorgain_gmp('') is None


def test_fiscal_year():
    import datetime
    assert gmp.fiscal_year(datetime.date(2026, 8, 25)) == "2026-27"
    assert gmp.fiscal_year(datetime.date(2026, 4, 1)) == "2026-27"
    assert gmp.fiscal_year(datetime.date(2027, 3, 31)) == "2026-27"
    assert gmp.fiscal_year(datetime.date(2026, 1, 15)) == "2025-26"


def test_source_order_dedupes_primary_and_fallbacks(monkeypatch):
    monkeypatch.setattr(gmp.config, "GMP_SOURCE", "investorgain")
    monkeypatch.setattr(gmp.config, "GMP_FALLBACKS", ["ipowatch", "investorgain", "ipocentral"])
    assert gmp.source_order() == ["investorgain", "ipowatch", "ipocentral"]


def test_source_order_excludes_none(monkeypatch):
    monkeypatch.setattr(gmp.config, "GMP_SOURCE", "ipowatch")
    monkeypatch.setattr(gmp.config, "GMP_FALLBACKS", ["none", "ipocentral"])
    assert gmp.source_order() == ["ipowatch", "ipocentral"]


def test_fetch_disabled_returns_empty(monkeypatch):
    monkeypatch.setattr(gmp.config, "GMP_SOURCE", "none")
    assert gmp.fetch([{"slug": "x"}]) == {}


def test_fetch_gap_fills_from_fallback(monkeypatch):
    """Primary supplies some; fallback fills only the still-missing IPOs."""
    monkeypatch.setattr(gmp.config, "GMP_SOURCE", "investorgain")
    monkeypatch.setattr(gmp.config, "GMP_FALLBACKS", ["ipowatch"])

    def fake_one(name, rows):
        if name == "investorgain":
            return {"a": 10.0}          # has 'a' only
        if name == "ipowatch":
            return {"a": 99.0, "b": 20.0}  # would also give 'a', but 'a' is taken
        return {}

    monkeypatch.setattr(gmp, "_fetch_one", fake_one)
    out = gmp.fetch([{"slug": "a"}, {"slug": "b"}, {"slug": "c"}])
    assert out == {"a": 10.0, "b": 20.0}   # primary wins 'a'; fallback fills 'b'


# --------------------------------------------------------------------------
# Listing-day price
# --------------------------------------------------------------------------
BHAV_HEADER = "TckrSymb,SctySrs,OpnPric,PrvsClsgPric,FinInstrmNm"


def _bhavcopy(*rows):
    """A one-file bhavcopy ZIP, as NSE publishes it."""
    import io as _io
    import zipfile as _zip

    text = "\n".join((BHAV_HEADER,) + rows) + "\n"
    buf = _io.BytesIO()
    with _zip.ZipFile(buf, "w") as archive:
        archive.writestr("BhavCopy.csv", text)
    return buf.getvalue()


def test_listing_gain_never_divides_by_nothing():
    """The two numbers this must never print are -100% and Infinity.

    Both were reachable: listing_price is written by nothing until a fetch
    succeeds, and NSE reports no price band at all for several SME issues.
    """
    assert listing.gain_percent(None, 100) is None
    assert listing.gain_percent(120, None) is None
    assert listing.gain_percent(120, 0) is None


def test_listing_gain_rounds_half_away_from_zero():
    """A 160 issue opening at 185 is exactly 15.625%.

    Python's round() answers 15.62 (half to even) while much of the industry
    prints 15.63. Either is defensible; an unpredictable rule is not.
    """
    assert listing.gain_percent(185, 160) == 15.63
    assert listing.gain_percent(99, 99) == 0.0
    assert listing.gain_percent(90, 100) == -10.0


def test_listing_not_read_before_the_archive_exists():
    """NSE publishes a day's bhavcopy that evening, so today is too early."""
    assert listing.is_readable("2026-08-26", "2026-08-27") is True
    assert listing.is_readable("2026-08-27", "2026-08-27") is False
    assert listing.is_readable("2026-08-28", "2026-08-27") is False
    assert listing.is_readable(None, "2026-08-27") is False


def test_listing_skips_locked_and_already_stored():
    assert listing._missing({"locked": ["listing_price"], "listing_price": None}) is False
    assert listing._missing({"locked": [], "listing_price": 72.0}) is False
    assert listing._missing({"locked": []}) is True


def test_listing_takes_the_issue_price_from_the_same_row():
    """PrvsClsgPric on a listing day IS the final issue price.

    Using price_band_high instead would be the CAP, and a book-built issue
    may price below it -- on DLF that turned a +0.30% listing into -4.25%.
    The error only ever runs one way, so it would never look wrong.
    """
    parsed = listing.parse_bhavcopy(
        _bhavcopy("ARDEE,EQ,72.00,53.00,ARDEE INDUSTRIES LIMITED")
    )
    assert parsed["ARDEE"]["open"] == 72.0
    assert parsed["ARDEE"]["prev_close"] == 53.0
    assert listing.gain_percent(72.0, 53.0) == 35.85


def test_listing_drops_rows_that_will_not_parse():
    """A 0.0 stored here would render as a -100% listing."""
    parsed = listing.parse_bhavcopy(_bhavcopy(
        "GOOD,EQ,72.00,53.00,Good Ltd",
        "NOOPEN,EQ,,53.00,No Open Ltd",
        "NOPREV,EQ,72.00,0,No Prev Ltd",
    ))
    assert set(parsed) == {"GOOD"}


def test_listing_headers_may_be_padded():
    """Some NSE CSVs pad every header and value; unstripped lookups miss."""
    import io as _io
    import zipfile as _zip

    padded = (
        "TckrSymb, SctySrs, OpnPric, PrvsClsgPric, FinInstrmNm\n"
        "ARDEE, EQ, 72.00, 53.00, ARDEE INDUSTRIES LIMITED\n"
    )
    buf = _io.BytesIO()
    with _zip.ZipFile(buf, "w") as archive:
        archive.writestr("BhavCopy.csv", padded)
    parsed = listing.parse_bhavcopy(buf.getvalue())
    assert parsed["ARDEE"]["open"] == 72.0


def test_estimated_listing_uses_the_stored_band_when_this_run_lacks_one():
    # NSE omits the price band on some runs. Reading only the fresh row left
    # estimated_listing untouched while gmp was written anyway, so the two
    # drifted apart and stayed apart — a ₹43 premium on a ₹53 band showing an
    # estimated listing of ₹98 (which is 53 + 45, two days stale).
    row = {"slug": "acme", "gmp": 43}
    existing = {"price_band_high": 53, "lot_size": 283}
    pipeline.compute_derived(row, 43, existing)
    assert row["estimated_listing"] == 96


def test_derived_still_prefers_this_runs_band_over_the_stored_one():
    # A band that genuinely changed must win over the stored copy.
    row = {"slug": "acme", "price_band_high": 60, "gmp": 10}
    existing = {"price_band_high": 53}
    pipeline.compute_derived(row, 10, existing)
    assert row["estimated_listing"] == 70


def test_min_investment_also_falls_back_to_the_stored_band_and_lot():
    row = {"slug": "acme"}
    existing = {"price_band_high": 53, "lot_size": 283}
    pipeline.compute_derived(row, None, existing)
    assert row["min_investment"] == 14999
    # Still no gmp, so still no estimate rather than a guess.
    assert "estimated_listing" not in row


# --------------------------------------------------------------------------
# Status ladder: upcoming -> open -> closed -> allotment -> listed
# --------------------------------------------------------------------------
def test_status_closes_at_six_pm_on_the_closing_day():
    # Bidding and the UPI mandate both end at 5pm IST, so by 6pm nobody can
    # still apply — but before that the issue really is still open.
    args = ("2026-08-24", "2026-08-27", None)
    assert util.derive_status(*args, today="2026-08-27", hour=9) == "open"
    assert util.derive_status(*args, today="2026-08-27", hour=17) == "open"
    assert util.derive_status(*args, today="2026-08-27", hour=18) == "closed"
    assert util.derive_status(*args, today="2026-08-27", hour=23) == "closed"


def test_status_reaches_allotment_then_listing():
    args = ("2026-08-24", "2026-08-27", "2026-09-01", "2026-08-28")
    assert util.derive_status(*args, today="2026-08-27", hour=9) == "open"
    assert util.derive_status(*args, today="2026-08-27", hour=20) == "closed"
    assert util.derive_status(*args, today="2026-08-28", hour=9) == "allotment"
    assert util.derive_status(*args, today="2026-08-31", hour=9) == "allotment"
    assert util.derive_status(*args, today="2026-09-01", hour=9) == "listed"


def test_status_never_leaves_a_closed_issue_showing_as_open():
    # The bug this exists for: Lumino, Sumax, ABH Healthcare and Madhur Knit
    # all sat on the site as "open" with closing dates one to five days past,
    # because nothing recomputed a row once NSE stopped returning it.
    for close in ("2026-08-27", "2026-08-28", "2026-08-31"):
        assert (
            util.derive_status("2026-08-24", close, None, today="2026-09-01", hour=0)
            == "closed"
        )


def test_status_without_any_dates_falls_back_to_upcoming():
    assert util.derive_status(None, None, None, today="2026-09-01", hour=12) == "upcoming"


def test_apply_status_demotes_a_carried_row_using_stored_dates():
    # A carried skeleton brings its stored timetable; the ladder must use it.
    row = {"slug": "lumino", "status": "open"}
    existing = {"open_date": "2026-08-27", "close_date": "2026-08-31", "locked": []}
    pipeline.apply_status(row, existing, today="2026-09-01")
    assert row["status"] == "closed"


def test_apply_status_leaves_a_row_alone_when_it_has_no_timetable():
    # Nothing to derive from: the source's own guess beats overwriting it.
    row = {"slug": "acme", "status": "open"}
    pipeline.apply_status(row, {}, today="2026-09-01")
    assert row["status"] == "open"


def test_apply_status_still_honours_a_locked_listing_date():
    # effective_listing_date already guards this; the ladder must not slip
    # past it and promote from the scraped value.
    row = {"slug": "acme", "status": "closed", "listing_date": "2026-09-01"}
    existing = {
        "listing_date": "2026-12-01",
        "close_date": "2026-08-27",
        "locked": ["listing_date"],
    }
    pipeline.apply_status(row, existing, today="2026-09-02")
    assert row["status"] == "closed"


def test_nse_active_flag_does_not_beat_a_past_close_date():
    # NSE keeps an issue marked "Active" after bidding has ended. Believing
    # that over the timetable is how four issues sat on the site as open with
    # closing dates days in the past.
    stale = dict(NSE_LIST_ROW, issueStartDate="19-Aug-2026", issueEndDate="21-Aug-2026")
    row = nse.normalize_list_item(stale)
    assert stale["status"] == "Active"
    assert util.derive_status(row["open_date"], row["close_date"], None,
                              today="2026-09-01", hour=0) == "closed"


# --------------------------------------------------------------------------
# GMP stops at listing; daily prices take over
# --------------------------------------------------------------------------
def test_gmp_history_stops_once_the_issue_has_listed():
    # The source keeps publishing a premium for a week after listing. Once a
    # real price exists the guess is not a second opinion about it.
    row = {"slug": "a", "gmp": 12}
    existing = {"listing_date": "2026-08-26", "locked": []}
    assert pipeline.gmp_is_observed(row, existing, today="2026-08-25") is True
    assert pipeline.gmp_is_observed(row, existing, today="2026-08-26") is False
    assert pipeline.gmp_is_observed(row, existing, today="2026-09-01") is False


def test_locked_gmp_also_stops_at_listing():
    # A hand-maintained premium is authoritative right up to the listing and
    # not one day past it.
    row = {"slug": "a"}
    existing = {"listing_date": "2026-08-26", "locked": ["gmp"], "gmp": 40}
    assert pipeline.gmp_is_observed(row, existing, today="2026-08-25") is True
    assert pipeline.gmp_is_observed(row, existing, today="2026-08-27") is False


def test_gmp_history_continues_when_there_is_no_listing_date():
    row = {"slug": "a", "gmp": 12}
    assert pipeline.gmp_is_observed(row, {}, today="2026-09-01") is True


def test_prices_parse_reads_ohlc_and_skips_non_equity():
    header = (
        "TradDt,BizDt,Sgmt,Src,FinInstrmTp,FinInstrmId,ISIN,TckrSymb,SctySrs,"
        "XpryDt,FininstrmActlXpryDt,StrkPric,OptnTp,FinInstrmNm,OpnPric,HghPric,"
        "LwPric,ClsPric,LastPric,PrvsClsgPric,UndrlygPric,SttlmPric,OpnIntrst,"
        "ChngInOpnIntrst,TtlTradgVol,TtlTrfVal,TtlNbOfTxsExctd,SsnId,NewBrdLotQty,Rmks"
    )
    equity = (
        "2026-08-31,2026-08-31,CM,NSE,STK,765396,INE18UN01038,GAJA,EQ,,,,,GAJA LTD,"
        "157.91,158.66,149.55,150.97,151.70,158.66,,151.07,,,3306446,504804205.72,24227,F1,1,"
    )
    debt = equity.replace(",GAJA,EQ,", ",SOMEBOND,N1,")
    import zipfile, io as _io

    buf = _io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("day.csv", "\n".join([header, equity, debt]))

    bars = prices.parse_day(buf.getvalue())
    assert set(bars) == {"GAJA"}, "only cash-market equity series belong in a price chart"
    bar = bars["GAJA"]
    assert (bar["o"], bar["h"], bar["l"], bar["c"]) == (157.91, 158.66, 149.55, 150.97)
    assert bar["v"] == 3306446
    assert bar["d"] == "2026-08-31"


def test_prices_asks_for_nothing_when_nothing_has_listed():
    rows = [{"slug": "a", "symbol": "AAA", "listing_date": None}]
    assert prices.fetch(rows, {}, today="2026-09-01") == {}


def test_prices_never_asks_for_today_or_a_weekend():
    # 2026-09-01 is a Tuesday; the day before is Monday, then the weekend.
    rows = [{"slug": "a", "symbol": "AAA", "listing_date": "2026-08-26"}]
    days, _ = prices._wanted_days(rows, {}, "2026-09-01")
    assert "2026-09-01" not in days, "today's file is not published until the evening"
    weekend = {"2026-08-29", "2026-08-30"}
    assert not (set(days) & weekend), "no bhavcopy exists on a Saturday or Sunday"
