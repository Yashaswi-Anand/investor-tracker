"""Unit tests for parsing and the manual-lock protection."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import db  # noqa: E402
import util  # noqa: E402
from sources import gmp, nse  # noqa: E402


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
    assert row["status"] == "open"
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
    pipeline.apply_listing_status(row, existing, today="2026-08-20")
    assert row["status"] == "listed"


def test_status_not_promoted_before_listing_date():
    row = {"slug": "a", "status": "closed"}
    existing = {"listing_date": "2026-08-25"}
    pipeline.apply_listing_status(row, existing, today="2026-08-20")
    assert row["status"] == "closed"


def test_status_promotion_noop_without_listing_date():
    row = {"slug": "a", "status": "closed"}
    pipeline.apply_listing_status(row, None, today="2026-08-20")
    assert row["status"] == "closed"
