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
    # Every table NSE has actually written to carries this. Its absence is
    # what distinguishes "nobody has bid" from "NSE never filled this in",
    # so the fixture has to have it or it is not a populated table.
    "updateTime": "Updated as on 05-Sep-2026 17:00:00",
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
    fields = nse.parse_detail(NSE_SME_DETAIL, "SME")
    assert fields["lot_size"] == 1200
    assert fields["face_value"] == 10.0
    # Two lots, because that is the smallest SME application.
    assert fields["min_investment"] == 2 * 1200 * 101


def test_parse_detail_without_a_board_assumes_one_lot():
    """The board is what makes it two, so an unknown board must not guess."""
    fields = nse.parse_detail(NSE_SME_DETAIL)
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
# Carrying listed rows long enough for the price chart to fill
# --------------------------------------------------------------------------
def test_days_ago_counts_back_in_calendar_days():
    assert util.days_ago(90, "2026-09-03") == "2026-06-05"
    assert util.days_ago(1, "2026-01-01") == "2025-12-31"   # across a year
    assert util.days_ago(1, "2028-03-01") == "2028-02-29"   # across a leap day
    assert util.days_ago(0, "2026-09-03") == "2026-09-03"


def test_unfinished_query_keeps_recently_listed_rows(monkeypatch):
    """The bug this exists to prevent.

    A listed row used to stop matching the moment its listing price landed —
    the same run that collected its first daily bar. Every listed IPO was
    left holding exactly one candle for ever.
    """
    seen = {}

    class _Response:
        status_code = 200

        def raise_for_status(self):
            pass

        def json(self):
            return []

    def fake_get(url, **kwargs):
        seen["url"] = url
        return _Response()

    monkeypatch.setattr(db.requests, "get", fake_get)
    db.fetch_unfinished([])

    url = seen["url"]
    # Still carried while the listing price is missing...
    assert "and(status.eq.listed,listing_price.is.null)" in url
    # ...and now also while the chart is still filling.
    assert f"and(status.eq.listed,listing_date.gte.{util.days_ago(db.PRICE_WINDOW_DAYS)})" in url


def test_unfinished_query_carries_every_status_before_listed(monkeypatch):
    """The second half of the same bug.

    'allotment' was missing from the carried statuses, and NSE drops an issue
    from its feed at about the moment it allots — so the row was never seen
    again and nothing could promote it to 'listed'. Five issues were stuck
    that way, two of them already trading.
    """
    seen = {}

    class _Response:
        status_code = 200

        def raise_for_status(self):
            pass

        def json(self):
            return []

    def fake_get(url, **kwargs):
        seen["url"] = url
        return _Response()

    monkeypatch.setattr(db.requests, "get", fake_get)
    db.fetch_unfinished([])

    for status in ("upcoming", "open", "closed", "allotment"):
        assert status in seen["url"], f"{status} rows would stop being carried"


def test_derive_status_promotes_allotment_to_listed_on_the_day():
    """The promotion the carry above exists to let happen."""
    assert (
        util.derive_status(
            "2026-08-25",
            "2026-08-27",
            "2026-09-02",
            "2026-08-28",
            today="2026-09-04",
            hour=12,
        )
        == "listed"
    )
    # ...and not a day early.
    assert (
        util.derive_status(
            "2026-08-25",
            "2026-08-27",
            "2026-09-05",
            "2026-08-28",
            today="2026-09-04",
            hour=12,
        )
        == "allotment"
    )


def test_zero_subscription_never_overwrites_a_real_figure():
    """The bug this exists to prevent.

    NSE fills ipo-active-category's ratio column with "0.00" for the whole
    bidding period on some issues — every SME one seen so far — while the
    share counts beside it climb. Qualiance read 0.00x in every category on
    the live site while the issue list, the demand graph and the same
    response's own timestamp all said 12.51x. The list row had it right and
    this parser wrote a zero over it.
    """
    payload = {
        "updateTime": "Updated as on 05-Sep-2026 17:00:00",
        "dataList": [
            {
                "srNo": "1",
                "category": "Qualified Institutional Buyers(QIBs)",
                "noOfShareOffered": "0",
                "noOfSharesBid": "2765000",
                "noOfTotalMeant": "0.00",
            },
            {
                "srNo": "2",
                "category": "Non Institutional Investors",
                "noOfShareOffered": "0",
                "noOfSharesBid": "6954000",
                "noOfTotalMeant": "0.00",
            },
        ]
    }
    # Shares were bid, so a 0.00 ratio is NSE not publishing one.
    assert nse.parse_subscription(payload) == {}


def test_zero_subscription_is_kept_when_nothing_was_bid():
    """The other half: before the first bid, zero is the truth."""
    payload = {
        "updateTime": "Updated as on 05-Sep-2026 17:00:00",
        "dataList": [
            {
                "srNo": "1",
                "category": "Qualified Institutional Buyers(QIBs)",
                "noOfShareOffered": "100",
                "noOfSharesBid": "0",
                "noOfTotalMeant": "0.00",
            }
        ]
    }
    assert nse.parse_subscription(payload) == {"subscription_qib": 0.0}


def test_all_zero_snapshots_are_not_recorded(monkeypatch):
    """405 of the first 1,080 history rows were all zeros — a chart floor
    that never happened. A snapshot that cannot tell "nothing bid yet" from
    "could not read it" is not worth a row."""
    sent = {}

    class _Response:
        status_code = 201

        def raise_for_status(self):
            pass

        def json(self):
            return []

    def fake_post(url, **kwargs):
        sent["json"] = kwargs.get("json")
        return _Response()

    monkeypatch.setattr(db.requests, "post", fake_post)

    written = db.append_subscription_history([
        # Nothing but zeros: dropped.
        {"slug": "a", "subscription_total": 0.0, "subscription_qib": 0.0},
        # Zeros in the categories but a real total: kept, that total is news.
        {"slug": "b", "subscription_total": 27.42, "subscription_qib": None},
    ])
    assert written == 1
    assert [row["slug"] for row in sent["json"]] == ["b"]


def test_unstamped_category_table_says_nothing():
    """The second half of the zero-subscription bug.

    ipo-active-category returns "Updated as on null" for a table NSE has
    never filled. Pranav's read that through its whole first morning while
    the issue list showed it 0.20x away, and every ratio in it was 0.00 —
    which the old guard let through, because nothing had been bid in the
    table either. An unwritten table has no ratios to report.
    """
    payload = {
        "updateTime": "Updated as on null",
        "dataList": [
            {"srNo": "None", "category": "Total",
             "noOfShareOffered": "0.0", "noOfSharesBid": "0.0", "noOfTotalMeant": "0.00"},
        ],
    }
    assert nse.parse_subscription(payload) == {}
    assert nse.category_stamp(payload) is None


def test_category_stamp_reads_a_written_table():
    """The stamp is what separates a table NSE has filled from one it has
    only declared. Kept because parse_subscription still turns on it."""
    assert nse.category_stamp(
        {"updateTime": "Updated as on 04-Sep-2026 17:00:00"}
    ) == "04-Sep-2026 17:00:00"
    assert nse.category_stamp({"updateTime": "Updated as on null"}) is None
    assert nse.category_stamp({}) is None


def test_book_takes_share_counts_from_the_live_response():
    """The bug this exists to prevent.

    Both responses carry per-category share counts and they disagree, because
    ipo-active-category lags — three days, on Qualiance, while bidDetails
    tracked the book through the morning. Building the table from the stale
    one put 69 lakh shares beside 4,172 applications when the real figure was
    2.5 crore, and lost retail entirely, because active-category omits the
    row bidDetails calls "Individual Investors".
    """
    detail = {
        "demandGraph": {"timestamp": "As on 07-Sep-2026 10:48:01 IST"},
        "bidDetails": [
            {"srNo": "1", "category": "QIBs",
             "noOfshareBid": "2768000", "noofapplication": "4"},
            {"srNo": "2", "category": "Non Institutional Investors",
             "noOfshareBid": "24998000", "noofapplication": "4172"},
            {"srNo": "3", "category": "Individual Investors (IND)",
             "noOfshareBid": "54930000", "noofapplication": "27465"},
        ],
    }
    stale = {
        "updateTime": "Updated as on 04-Sep-2026 17:00:00",
        "dataList": [
            # Three days old, and 3.6x under the live figure.
            {"srNo": "2", "category": "Non Institutional Investors",
             "noOfShareOffered": "0", "noOfSharesBid": "6954000",
             "noOfTotalMeant": "0.00"},
        ],
    }
    book = nse.parse_book(detail, stale)

    assert book["at"] == "07-Sep-2026 10:48:01 IST"
    rows = {row["key"]: row for row in book["rows"]}
    # Retail exists only in the live response, and must survive.
    assert set(rows) == {"qib", "nii", "retail"}
    assert rows["nii"]["bid"] == 24998000, "the stale 6954000 must not win"
    assert rows["retail"]["applications"] == 27465
    # A zero offered / zero ratio from the stale table is dropped, not shown.
    assert "offered" not in rows["nii"]
    assert "times" not in rows["nii"]


# Two live responses, kept verbatim, because the whole difficulty of
# parse_book is that they disagree for two unrelated reasons at once.
PRANAV_DETAIL = {  # mainboard, on both exchanges
    "demandGraph": {"timestamp": "As on 07-Sep-2026 12:46:01 IST"},
    # NSE spells it noOfsharesBid here and noOfshareBid on the SME issue.
    "bidDetails": [
        {"srNo": "1", "noOfSharesOffered": "4701558", "noOfsharesBid": "3360"},
        {"srNo": "2", "noOfSharesOffered": "4440395", "noOfsharesBid": "12918240"},
        {"srNo": "3", "noOfSharesOffered": "13321184", "noOfsharesBid": "25901760"},
    ],
}
PRANAV_CAT = {  # current, and counting BOTH exchanges
    "updateTime": "Updated as on 07-Sep-2026 12:42:00",
    "dataList": [
        {"srNo": "1", "noOfShareOffered": "4701558", "noOfSharesBid": "19560"},
        {"srNo": "2", "noOfShareOffered": "4440395", "noOfSharesBid": "18438000"},
        {"srNo": "3", "noOfShareOffered": "13321184", "noOfSharesBid": "39003360"},
    ],
}
QUALIANCE_DETAIL = {  # SME
    "demandGraph": {"timestamp": "As on 07-Sep-2026 10:48:01 IST"},
    "bidDetails": [
        {"srNo": "1", "noOfshareBid": "2768000", "noofapplication": "4"},
        {"srNo": "3", "noOfshareBid": "54930000", "noofapplication": "27465"},
    ],
}
QUALIANCE_CAT = {  # three days stale, and missing retail entirely
    "updateTime": "Updated as on 04-Sep-2026 17:00:00",
    "dataList": [
        {"srNo": "1", "noOfShareOffered": "0", "noOfSharesBid": "2765000"},
    ],
}


def test_book_reads_both_of_nses_spellings():
    """A mainboard book says noOfsharesBid and an SME one says noOfshareBid,
    one letter apart. Reading only the SME spelling dropped the bid figures
    off every mainboard issue while still showing their reservations — a
    table of categories that had apparently been offered shares and bid
    nothing, under a headline saying the issue was twice subscribed."""
    mainboard = {r["key"]: r for r in nse.parse_book(PRANAV_DETAIL, None)["rows"]}
    assert mainboard["retail"]["bid"] == 25901760
    sme = {r["key"]: r for r in nse.parse_book(QUALIANCE_DETAIL, None)["rows"]}
    assert sme["retail"]["bid"] == 54930000


def test_book_prefers_the_combined_exchanges_while_it_is_current():
    """ipo-active-category counts every exchange the issue trades on and
    bidDetails counts NSE alone — 5.83 crore against 3.88 crore on the same
    issue at the same moment. Neither is wrong, so the combined one wins
    while it is keeping up, and the scope records which was used."""
    book = nse.parse_book(PRANAV_DETAIL, PRANAV_CAT)
    rows = {r["key"]: r for r in book["rows"]}
    assert book["scope"] == "all"
    assert book["at"] == "07-Sep-2026 12:42:00"
    assert rows["retail"]["bid"] == 39003360, "the combined figure, not NSE's"
    assert rows["retail"]["times"] == round(39003360 / 13321184, 2)


def test_combined_book_must_also_carry_every_category():
    """Fresh is not enough; it has to be complete.

    Qualiance's combined table is written on time and still has no retail row
    in it at all — not stale, absent. Choosing it on freshness alone produced
    a retail row carrying fifty thousand applications and no shares bid,
    because the applications came from the live book and the shares from a
    table that does not have that category. A book that cannot show retail is
    not the better book.
    """
    detail = {
        "demandGraph": {"timestamp": "As on 07-Sep-2026 14:00:00 IST"},
        "bidDetails": [
            {"srNo": "1", "noOfshareBid": "2768000", "noofapplication": "4"},
            {"srNo": "3", "noOfshareBid": "100442000", "noofapplication": "50221"},
        ],
    }
    current_but_partial = {
        "updateTime": "Updated as on 07-Sep-2026 14:00:00",
        "dataList": [{"srNo": "1", "noOfShareOffered": "0", "noOfSharesBid": "2768000"}],
    }
    book = nse.parse_book(detail, current_but_partial)
    rows = {r["key"]: r for r in book["rows"]}
    assert book["scope"] == "nse", "the complete book wins over the fresher one"
    assert rows["retail"]["bid"] == 100442000
    assert rows["retail"]["applications"] == 50221


def test_a_row_of_applications_alone_is_not_a_row():
    """Applications ride along from the live book whichever source supplied
    the shares. Without shares behind them they describe nothing."""
    book = nse.parse_book({
        "demandGraph": {"timestamp": "As on 07-Sep-2026 14:00:00 IST"},
        "bidDetails": [{"srNo": "3", "noofapplication": "50221"}],
    })
    assert book is None


def test_book_falls_back_to_nse_alone_when_the_combined_book_is_stale():
    """Qualiance's combined table sat on the previous Friday for three days
    while the issue went from twelve times subscribed to twenty-three. A
    fuller book that is days old is worth less than a narrower one that is
    current — and it also omits retail, the row most readers are in."""
    book = nse.parse_book(QUALIANCE_DETAIL, QUALIANCE_CAT)
    rows = {r["key"]: r for r in book["rows"]}
    assert book["scope"] == "nse"
    assert book["at"] == "07-Sep-2026 10:48:01 IST", "the live stamp, not the stale one"
    assert rows["qib"]["bid"] == 2768000, "not the stale table's 2765000"
    assert "retail" in rows, "retail exists only in the live response"
    assert rows["retail"]["applications"] == 27465
    # A zero reservation is not a reservation.
    assert "offered" not in rows["qib"]
    assert "times" not in rows["qib"]


def test_book_never_republishes_a_stale_ratio():
    """The bug an adversarial review caught in the previous commit.

    Reservation is a fixed quantity and safe to take from the lagging
    endpoint. Its RATIO is not: it was computed whenever that endpoint last
    ran. On Qualiance it read 4.80x three days after the fact, and the row
    was published under the live timestamp beside a live bid that divided by
    the same reservation to 17.25x. The earlier test missed it because its
    stale ratio was "0.00", which the truthiness check already dropped — any
    non-zero one sailed through.
    """
    detail = {
        "demandGraph": {"timestamp": "As on 07-Sep-2026 10:48:01 IST"},
        "bidDetails": [
            {"srNo": "2", "noOfshareBid": "24998000", "noofapplication": "4172"},
        ],
    }
    stale = {
        "updateTime": "Updated as on 04-Sep-2026 17:00:00",
        "dataList": [
            {"srNo": "2", "noOfShareOffered": "1449000",
             "noOfSharesBid": "6954000", "noOfTotalMeant": "4.80"},
        ],
    }
    row = nse.parse_book(detail, stale)["rows"][0]
    assert row["offered"] == 1449000        # a reservation does not go stale
    assert row["times"] == 17.25            # 24998000 / 1449000, both current
    assert row["times"] != 4.80, "NSE's own ratio must never be republished"


def test_book_survives_the_category_endpoint_failing():
    """Its primary source is the detail response, so the flakier of the two
    calls going down must not take a book we already hold with it."""
    detail = {
        "demandGraph": {"timestamp": "As on 07-Sep-2026 10:48:01 IST"},
        "bidDetails": [
            {"srNo": "3", "noOfshareBid": "54930000", "noofapplication": "27465"},
        ],
    }
    book = nse.parse_book(detail, None)
    assert book["rows"][0]["bid"] == 54930000
    assert book["rows"][0]["applications"] == 27465
    # No reservation to divide by, so no ratio is claimed.
    assert "times" not in book["rows"][0]


def test_book_uses_the_combined_table_wholesale_when_it_is_current():
    """Which source a row comes from is decided once, for the whole row.

    Taking the bid from one response and the reservation from another would
    produce a ratio describing neither book: bidDetails counts NSE and
    ipo-active-category counts every exchange, so 2768000 over a reservation
    from the combined table is a number nobody measured. When the combined
    table is current it supplies the whole row."""
    detail = {
        "demandGraph": {"timestamp": "As on 07-Sep-2026 10:48:01 IST"},
        "bidDetails": [
            {"srNo": "1", "category": "QIBs",
             "noOfshareBid": "2768000", "noofapplication": "4"},
        ],
    }
    good = {
        "updateTime": "Updated as on 07-Sep-2026 10:45:00",
        "dataList": [
            {"srNo": "1", "category": "QIBs", "noOfShareOffered": "483000",
             "noOfSharesBid": "2765000", "noOfTotalMeant": "5.72"},
        ],
    }
    book = nse.parse_book(detail, good)
    row = book["rows"][0]
    assert book["scope"] == "all", "the combined table is current, so it wins"
    assert row["bid"] == 2765000, "the combined count, not NSE's 2768000"
    assert row["offered"] == 483000
    # Derived, never copied: 2765000 / 483000 = 5.72, which happens to agree
    # with the ratio NSE computed — but agreement is the point, not the source.
    assert row["times"] == round(2765000 / 483000, 2)
    # Applications live only in bidDetails, so they cross over regardless.
    assert row["applications"] == 4


def test_book_is_absent_when_nothing_has_been_bid():
    """A row of nothing but a label is not a row."""
    assert nse.parse_book({"bidDetails": [
        {"srNo": "1", "category": "QIBs", "noOfshareBid": "0",
         "noofapplication": "0"},
    ]}) is None
    assert nse.parse_book({}) is None


def test_categories_carry_the_nii_split():
    """NII splits at ten lakh, and which side a bid falls on decides which
    pool it is allotted from. NSE numbers those rows 2.1 and 2.2."""
    payload = {
        "updateTime": "Updated as on 05-Sep-2026 17:00:00",
        "dataList": [
            {"srNo": "Sr.No.", "category": "Category"},
            {"srNo": "2", "category": "Non Institutional Investors",
             "noOfShareOffered": "1000", "noOfSharesBid": "6954000", "noOfTotalMeant": "3.5"},
            {"srNo": "2.1", "category": "Non Institutional Investors(Bid amount of more than Ten Lakh Rupees)",
             "noOfShareOffered": "600", "noOfSharesBid": "4643000", "noOfTotalMeant": "2.1"},
            {"srNo": "2.2", "category": "Non Institutional Investors(Bid amount of more than Two Lakh Rupees upto Ten Lakh Rupees)",
             "noOfShareOffered": "400", "noOfSharesBid": "2311000", "noOfTotalMeant": "1.4"},
            # Sub-rows split a category by investor type; they are not rungs.
            {"srNo": "2.1(a)", "category": "Corporates", "noOfSharesBid": "19000"},
        ]
    }
    rows = nse.parse_book(
        {
            "bidDetails": [
                {"srNo": "2", "noOfshareBid": "6954000"},
                {"srNo": "2.1", "noOfshareBid": "4643000"},
                {"srNo": "2.2", "noOfshareBid": "2311000"},
                # Sub-rows split a category by investor type; not rungs.
                {"srNo": "2.1(a)", "noOfshareBid": "19000"},
            ]
        },
        payload,
    )["rows"]
    assert [r["key"] for r in rows] == ["nii", "nii_big", "nii_small"]
    assert rows[1]["bid"] == 4643000
    assert rows[2]["offered"] == 400


def test_issue_split_reads_rupees_and_shares():
    """NSE states the fresh/OFS halves either as an amount with a unit or as
    a share count, and both turn up in the same week."""
    rupees = nse.parse_issue_split(
        "Initial public offer comprising of fresh issue aggregating up to "
        "Rs. 3,156 million and offer for sale of up to 2,856,869 Equity Shares"
    )
    assert rupees == {"fresh_cr": 315.6, "ofs_shares": 2856869}

    shares = nse.parse_issue_split(
        "Initial Public Offer comprising of Fresh Issue of up to 35,52,000 "
        "Equity Shares (including Market Maker portion of 1,80,000 shares)"
    )
    assert shares == {"fresh_shares": 3552000}

    assert nse.parse_issue_split("") is None


def test_missing_bse_flag_is_not_an_nse_only_claim():
    """isBse is sparse: NSE sets it on some rows and leaves it null on
    others, mainboard issues included. Absent means NSE did not say, and
    saying "Listing At: NSE" on that would be a wrong fact, not a thin one."""
    assert nse.normalize_list_item(
        {"companyName": "X Ltd", "symbol": "X", "isBse": "1"}
    )["_is_bse"] is True
    assert nse.normalize_list_item(
        {"companyName": "X Ltd", "symbol": "X", "isBse": None}
    )["_is_bse"] is False


def test_price_window_matches_what_the_chart_keeps():
    """Carrying a row longer than the chart displays would be work with
    nowhere to go; carrying it for less would truncate the chart."""
    assert db.PRICE_WINDOW_DAYS == prices.MAX_BARS


# --------------------------------------------------------------------------
# Minimum application: one lot on the mainboard, two on SME
# --------------------------------------------------------------------------
def test_min_lots_is_two_only_for_sme():
    assert util.min_lots("SME") == 2
    assert util.min_lots("sme") == 2
    assert util.min_lots("  SME  ") == 2
    assert util.min_lots("Mainboard") == 1
    assert util.min_lots(None) == 1
    assert util.min_lots("") == 1


def test_min_investment_needs_both_a_lot_and_a_band():
    assert util.min_investment(None, 100, "SME") is None
    assert util.min_investment(1200, None, "SME") is None
    assert util.min_investment(0, 100, "SME") is None


def test_pipeline_recomputes_an_sme_minimum_left_at_one_lot():
    """The reason it recomputes every run rather than only when empty.

    Rows written under the old one-lot rule keep that figure forever
    otherwise, and the ones that have already listed would never be
    re-derived at all.
    """
    row = {"slug": "acme", "board": "SME", "lot_size": 1200,
           "price_band_high": 101, "min_investment": 1200 * 101}
    pipeline.compute_derived(row, None, {})
    assert row["min_investment"] == 2 * 1200 * 101


def test_pipeline_takes_the_board_from_the_stored_row_when_absent():
    """NSE drops an issue from its feed once bidding closes; the board it
    was scraped with is the only one left to judge it by."""
    row = {"slug": "acme", "lot_size": 1200, "price_band_high": 101}
    pipeline.compute_derived(row, None, {"board": "SME"})
    assert row["min_investment"] == 2 * 1200 * 101


def test_mainboard_minimum_stays_one_lot():
    row = {"slug": "acme", "board": "Mainboard", "lot_size": 93,
           "price_band_high": 160}
    pipeline.compute_derived(row, None, {})
    assert row["min_investment"] == 93 * 160


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
