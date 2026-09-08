"""KFin lookup ids: reading their bundle, and matching their names to ours."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sources import kfin  # noqa: E402


# A slice of what main.<hash>.js actually looks like: the directory is a JSON
# literal inside a single-quoted JS string, minified onto one line, with the
# API base a few hundred kilobytes away in another module.
BUNDLE = (
    'var rf=JSON.parse(\'[{"clientId":"40580036070","name":"FLY HI MARITIME '
    'TRAVELS LIMITED"},{"clientId":"60121009540","name":"RAYS OF BELIEF '
    'LIMITED"},{"clientId":"34024394990","name":"ASHUTOSH FIBRE LIMITED SME"},'
    '{"clientId":"64793825640","name":"ASHUTOSH FIBRE LIMITED"},'
    '{"clientId":"61328680581","name":"TEMPSENS INSTRUMENTS (INDIA) LIMITED"},'
    '{"clientId":"85357713080","name":"SHANTI INORGANICS LIMITED"},'
    '{"clientId":"11111111111","name":"ACME POWER LIMITED"},'
    '{"clientId":"22222222222","name":"ACME POWER SYSTEMS LIMITED"},'
    '{"clientId":"33333333333","name":"D\\\'MART RETAIL LIMITED"}]\');'
    "function x(){}"
    'const to="https://0uz601ms56.execute-api.ap-south-1.amazonaws.com/prod/api/query?type=";'
    'ki.get(to+t,{headers:{reqparam:n,client_id:`${S}`}})'
)

INDEX = (
    '<!doctype html><html><head><script defer="defer" '
    'src="./static/js/main.6259bb18.js"></script>'
    '<link href="./static/css/main.aba1885a.css" rel="stylesheet"></head></html>'
)


def test_bundle_name_is_read_from_the_portal_page():
    assert kfin.parse_bundle_name(INDEX) == "static/js/main.6259bb18.js"
    assert kfin.parse_bundle_name("<html></html>") is None


def test_directory_is_read_from_the_bundle():
    directory = kfin.parse_directory(BUNDLE)
    assert directory["endpoint"] == (
        "https://0uz601ms56.execute-api.ap-south-1.amazonaws.com/prod/api/query?type="
    )
    names = {i["client_id"]: i["name"] for i in directory["issues"]}
    assert names["60121009540"] == "RAYS OF BELIEF LIMITED"
    assert names["34024394990"] == "ASHUTOSH FIBRE LIMITED SME"
    # The JS-escaped apostrophe comes back as an apostrophe.
    assert names["33333333333"] == "D'MART RETAIL LIMITED"
    assert len(directory["issues"]) == 9


def test_directory_is_empty_when_the_bundle_has_moved_on():
    directory = kfin.parse_directory("var a=1;")
    assert directory == {"endpoint": None, "issues": []}


ISSUES = kfin.parse_directory(BUNDLE)["issues"]


def _row(name, board="Mainboard", short_name=None):
    return {"name": name, "board": board, "short_name": short_name}


def test_tokens_drop_suffixes_wherever_they_fall():
    assert kfin.tokens("Rays of Belief Limited- For Profit Social Enterprise (FPSE)") == [
        "RAYS", "OF", "BELIEF", "FOR", "PROFIT", "SOCIAL", "ENTERPRISE", "FPSE",
    ]
    assert kfin.tokens("Tempsens Instruments (India) Limited") == [
        "TEMPSENS", "INSTRUMENTS", "INDIA",
    ]
    assert kfin.tokens("Acme Pvt. Ltd.") == ["ACME"]


def test_match_reads_through_nses_long_descriptor():
    """NSE names Rays of Belief with a seven-word tail KFin does not carry."""
    hit = kfin.match(
        _row("Rays of Belief Limited- For Profit Social Enterprise (FPSE)"), ISSUES
    )
    assert hit["client_id"] == "60121009540"


def test_match_is_exact_where_the_names_agree():
    assert kfin.match(_row("Shanti Inorganics Limited", "SME"), ISSUES)["client_id"] == "85357713080"
    assert kfin.match(_row("Tempsens Instruments (India) Limited"), ISSUES)["client_id"] == "61328680581"


def test_match_uses_the_board_to_split_sme_from_mainboard():
    """KFin lists Ashutosh Fibre twice, one entry ending in SME. The board
    picks; a wrong id would answer a reader's lookup for the wrong issue."""
    assert kfin.match(_row("Ashutosh Fibre Limited", "SME"), ISSUES)["client_id"] == "34024394990"
    assert kfin.match(_row("Ashutosh Fibre Limited", "Mainboard"), ISSUES)["client_id"] == "64793825640"
    assert kfin.match(_row("Ashutosh Fibre Limited", ""), ISSUES) is None


def test_match_prefers_the_exact_name_over_a_longer_one():
    """"ACME POWER" must not also claim "ACME POWER SYSTEMS"."""
    assert kfin.match(_row("Acme Power Limited"), ISSUES)["client_id"] == "11111111111"
    assert kfin.match(_row("Acme Power Systems Limited"), ISSUES)["client_id"] == "22222222222"


def test_match_refuses_a_single_word():
    """One word is not an identity: "ACME" alone must claim nothing."""
    assert kfin.match(_row("Acme Limited"), ISSUES) is None
    assert kfin.match(_row("", short_name="Acme"), ISSUES) is None


def test_match_returns_nothing_for_an_issue_kfin_does_not_have():
    assert kfin.match(_row("Pranav Constructions Limited"), ISSUES) is None


def test_is_kfin_reads_either_field():
    assert kfin.is_kfin({"registrar": "Kfintech Technologies Limited"})
    assert kfin.is_kfin({"registrar": "KFIN Technologies Limited"})
    assert kfin.is_kfin({"registrar_url": "https://ipostatus.kfintech.com/"})
    assert not kfin.is_kfin({"registrar": "Bigshare Services Private Limited"})
    assert not kfin.is_kfin({})


def test_fetch_writes_one_record_per_matched_issue(monkeypatch):
    monkeypatch.setattr(
        kfin, "fetch_directory", lambda session=None: kfin.parse_directory(BUNDLE)
    )
    rows = [
        {"slug": "rays", "name": "Rays of Belief Limited- For Profit Social Enterprise (FPSE)",
         "board": "Mainboard", "registrar": "KFin Technologies Limited",
         "updated_at": "2026-09-07T13:00:00Z"},
        {"slug": "pranav", "name": "Pranav Constructions Limited", "board": "Mainboard",
         "registrar": "KFin Technologies Limited"},
        {"slug": "deepa", "name": "Deepa Jewellers Limited", "board": "Mainboard",
         "registrar": "Bigshare Services Private Limited"},
    ]
    out = kfin.fetch(rows)
    assert set(out) == {"rays"}
    assert out["rays"] == {
        "registrar": "kfin",
        "client_id": "60121009540",
        "name": "RAYS OF BELIEF LIMITED",
        "endpoint": "https://0uz601ms56.execute-api.ap-south-1.amazonaws.com/prod/api/query?type=",
        "at": "2026-09-07T13:00:00Z",
    }


def test_fetch_is_silent_when_the_directory_cannot_be_read(monkeypatch):
    monkeypatch.setattr(kfin, "fetch_directory", lambda session=None: None)
    rows = [{"slug": "rays", "name": "Rays of Belief Limited", "board": "Mainboard",
             "registrar": "KFin Technologies Limited"}]
    assert kfin.fetch(rows) == {}


def test_fetch_makes_no_request_when_no_issue_is_at_kfin(monkeypatch):
    def boom(session=None):
        raise AssertionError("directory must not be fetched")

    monkeypatch.setattr(kfin, "fetch_directory", boom)
    rows = [{"slug": "deepa", "name": "Deepa Jewellers Limited", "board": "Mainboard",
             "registrar": "Bigshare Services Private Limited"}]
    assert kfin.fetch(rows) == {}


# --------------------------------------------------------------------------
# The regression that made the whole step a no-op in production.
# --------------------------------------------------------------------------
def test_resolve_fills_a_carried_skeleton_from_the_stored_row():
    """db.fetch_unfinished returns slug, name, status, symbol and dates —
    deliberately nothing else. Every issue this step can answer for has
    already closed, so NSE no longer lists it and the skeleton is the ONLY
    row there is. Reading registrar off it finds nothing."""
    skeleton = {"slug": "ashutosh-fibre-limited", "name": "Ashutosh Fibre Limited",
                "status": "listed", "updated_at": "2026-09-08T05:00:00Z"}
    assert not kfin.is_kfin(skeleton), "the bug: the skeleton looks like no registrar at all"

    existing = {"ashutosh-fibre-limited": {
        "registrar": "Kfintech Technologies Limited",
        "registrar_url": "https://ipostatus.kfintech.com/",
        "board": "SME",
    }}
    view = kfin.resolve(skeleton, existing)
    assert kfin.is_kfin(view)
    assert view["board"] == "SME"
    assert view["updated_at"] == "2026-09-08T05:00:00Z", "the run's stamp, not the stored one"


def test_resolve_prefers_this_run_over_what_is_stored():
    """A registrar NSE published today wins over one stored last week."""
    view = kfin.resolve(
        {"slug": "x", "name": "New Name", "board": "Mainboard",
         "registrar": "KFin Technologies Limited"},
        {"x": {"name": "Old Name", "board": "SME", "registrar": "Bigshare Services"}},
    )
    assert view["name"] == "New Name"
    assert view["board"] == "Mainboard"
    assert view["registrar"] == "KFin Technologies Limited"


def test_fetch_matches_carried_rows_that_only_the_database_knows(monkeypatch):
    """End to end over the shape a real run has: NSE hands over the open and
    upcoming issues, fetch_unfinished carries the closed ones as skeletons,
    and only the second kind can be matched — KFin does not list an issue
    until it has closed."""
    monkeypatch.setattr(
        kfin, "fetch_directory", lambda session=None: kfin.parse_directory(BUNDLE)
    )
    rows = [
        # From NSE: full row, but KFin has no entry for it yet.
        {"slug": "pranav", "name": "Pranav Constructions Limited", "board": "Mainboard",
         "registrar": "KFin Technologies Limited", "updated_at": "2026-09-08T05:00:00Z"},
        # Carried skeletons: everything the matcher needs is in `existing`.
        {"slug": "ashutosh", "name": "Ashutosh Fibre Limited", "status": "listed",
         "updated_at": "2026-09-08T05:00:00Z"},
        {"slug": "shanti", "name": "Shanti Inorganics Limited", "status": "listed",
         "updated_at": "2026-09-08T05:00:00Z"},
        {"slug": "deepa", "name": "Deepa Jewellers Limited", "status": "listed",
         "updated_at": "2026-09-08T05:00:00Z"},
    ]
    existing = {
        "ashutosh": {"registrar": "Kfintech Technologies Limited", "board": "SME"},
        "shanti": {"registrar": "KFin Technologies Limited", "board": "SME"},
        "deepa": {"registrar": "Bigshare Services Private Limited", "board": "Mainboard"},
    }
    out = kfin.fetch(rows, existing)
    assert set(out) == {"ashutosh", "shanti"}, "Bigshare is not ours; Pranav is not listed by KFin yet"
    assert out["ashutosh"]["client_id"] == "34024394990", "the SME id, chosen by the stored board"
    assert out["shanti"]["client_id"] == "85357713080"


def test_fetch_without_existing_still_works_for_full_rows(monkeypatch):
    """The other caller shape: a row NSE returned in full needs no stored
    fallback, and passing no `existing` at all must not throw."""
    monkeypatch.setattr(
        kfin, "fetch_directory", lambda session=None: kfin.parse_directory(BUNDLE)
    )
    out = kfin.fetch([
        {"slug": "rays", "name": "Rays of Belief Limited- For Profit Social Enterprise (FPSE)",
         "board": "Mainboard", "registrar": "KFin Technologies Limited"}
    ])
    assert out["rays"]["client_id"] == "60121009540"
