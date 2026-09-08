"""The registrar's own spelling, for the issues we hand off rather than check."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sources import handoff  # noqa: E402


BIGSHARE_HTML = """
<select id="ddlCompany">
  <option>--Select Company--</option>
  <option value="9048">DEEPA JEWELLERS LIMITED</option>
  <option value="594">FARM PEACE LIMITED</option>
  <option value="9047">LUMINO INDUSTRIES LIMITED</option>
</select>
<select id="SelectionType">
  <option value="0">Select Selection Type</option>
  <option value="PN">PAN</option>
</select>
<select id="ddlType"><option value="0">Select Type</option></select>
"""

# Their response is JSON whose one string is an XML document, so every angle
# bracket arrives escaped. This is the real shape, trimmed.
MUFG_JSON = (
    '{"d":"\\u003cNewDataSet\\u003e\\r\\n  \\u003cTable\\u003e\\r\\n    '
    '\\u003ccompany_id\\u003e11929\\u003c/company_id\\u003e\\r\\n    '
    '\\u003ccompanyname\\u003ePhychem Technologies Limited - SME IPO\\u003c/companyname\\u003e\\r\\n  '
    '\\u003c/Table\\u003e\\r\\n  \\u003cTable\\u003e\\r\\n    '
    '\\u003ccompany_id\\u003e11927\\u003c/company_id\\u003e\\r\\n    '
    '\\u003ccompanyname\\u003eESDS Software Solution Limited - IPO\\u003c/companyname\\u003e\\r\\n  '
    '\\u003c/Table\\u003e\\r\\n  \\u003cTable\\u003e\\r\\n    '
    '\\u003ccompany_id\\u003e11925\\u003c/company_id\\u003e\\r\\n    '
    '\\u003ccompanyname\\u003eAugmont Enterprises Limited - IPO\\u003c/companyname\\u003e\\r\\n  '
    '\\u003c/Table\\u003e\\r\\n\\u003c/NewDataSet\\u003e"}'
)


def test_bigshare_list_drops_the_placeholders():
    """Three selects on one page; only one of them is companies, and the
    others open with a "Select ..." entry that is not an issue."""
    entries = handoff.parse_bigshare(BIGSHARE_HTML)
    assert [e["client_id"] for e in entries] == ["9048", "594", "9047"]
    assert entries[0]["name"] == "DEEPA JEWELLERS LIMITED"


def test_bigshare_list_survives_a_page_that_has_moved_on():
    assert handoff.parse_bigshare("<html></html>") == []
    assert handoff.parse_bigshare("") == []


def test_mufg_list_is_read_through_two_layers_of_escaping():
    entries = handoff.parse_mufg(MUFG_JSON)
    assert [e["client_id"] for e in entries] == ["11929", "11927", "11925"]
    assert entries[1]["name"] == "ESDS Software Solution Limited - IPO"


def test_mufg_list_is_empty_when_the_shape_changes():
    assert handoff.parse_mufg('{"d":"<NewDataSet></NewDataSet>"}') == []
    assert handoff.parse_mufg("not json") == []
    assert handoff.parse_mufg({}) == []


def test_mufg_issue_type_marker_becomes_the_one_the_matcher_reads():
    """KFin writes "... LIMITED SME" and MUFG writes "... Limited - SME IPO".
    The matcher already knows the first shape, so the second is translated
    rather than the matcher taught a second dialect."""
    assert handoff.normalise_mufg("Phychem Technologies Limited - SME IPO") == (
        "Phychem Technologies Limited SME"
    )
    assert handoff.normalise_mufg("ESDS Software Solution Limited - IPO") == (
        "ESDS Software Solution Limited"
    )
    assert handoff.normalise_mufg("Acme Limited") == "Acme Limited"


def _patch(monkeypatch):
    monkeypatch.setattr(
        handoff, "fetch_bigshare", lambda session=None: handoff.parse_bigshare(BIGSHARE_HTML)
    )
    monkeypatch.setattr(
        handoff, "fetch_mufg", lambda session=None: handoff.parse_mufg(MUFG_JSON)
    )


def test_fetch_names_each_issue_as_its_registrar_does(monkeypatch):
    _patch(monkeypatch)
    rows = [
        {"slug": "deepa", "name": "Deepa Jewellers Limited", "status": "listed"},
        {"slug": "esds", "name": "ESDS Software Solution Limited", "status": "listed"},
        {"slug": "rays", "name": "Rays of Belief Limited", "status": "listed"},
    ]
    existing = {
        "deepa": {"registrar": "Bigshare Services Private Limited", "board": "Mainboard"},
        "esds": {"registrar": "MUFG Intime India Private Limited", "board": "Mainboard"},
        "rays": {"registrar": "KFin Technologies Limited", "board": "Mainboard"},
    }
    out = handoff.fetch(rows, existing)
    assert set(out) == {"deepa", "esds"}, "KFin is checked directly, not handed off"
    assert out["deepa"] == {
        "registrar": "bigshare",
        "name": "DEEPA JEWELLERS LIMITED",
        "id": "9048",
    }
    # The label keeps MUFG's own " - IPO" tail, because that is what the
    # reader has to find in their dropdown.
    assert out["esds"] == {
        "registrar": "mufg",
        "name": "ESDS Software Solution Limited - IPO",
        "id": "11927",
    }


def test_fetch_reads_the_registrar_off_the_stored_row(monkeypatch):
    """The same skeleton problem KFin had: a carried row carries no registrar,
    so without `existing` nothing is recognised and no list is fetched."""
    _patch(monkeypatch)
    rows = [{"slug": "deepa", "name": "Deepa Jewellers Limited", "status": "listed"}]
    assert handoff.fetch(rows, None) == {}, "no registrar anywhere -> nothing to do"
    assert handoff.fetch(
        rows, {"deepa": {"registrar": "Bigshare Services Private Limited"}}
    )["deepa"]["id"] == "9048"


def test_fetch_fetches_nothing_when_no_issue_is_at_either_registrar(monkeypatch):
    def boom(session=None):
        raise AssertionError("no list should be fetched")

    monkeypatch.setattr(handoff, "fetch_bigshare", boom)
    monkeypatch.setattr(handoff, "fetch_mufg", boom)
    rows = [{"slug": "rays", "name": "Rays of Belief Limited"}]
    existing = {"rays": {"registrar": "KFin Technologies Limited"}}
    assert handoff.fetch(rows, existing) == {}


def test_fetch_is_silent_when_a_list_cannot_be_read(monkeypatch):
    """A registrar whose page is down leaves the hand-off exactly where it
    started — "pick the company" — rather than failing the run."""
    monkeypatch.setattr(handoff, "fetch_bigshare", lambda session=None: [])
    monkeypatch.setattr(handoff, "fetch_mufg", lambda session=None: [])
    rows = [{"slug": "deepa", "name": "Deepa Jewellers Limited"}]
    existing = {"deepa": {"registrar": "Bigshare Services Private Limited"}}
    assert handoff.fetch(rows, existing) == {}


def test_fetch_refuses_a_name_it_cannot_pin_to_one_entry(monkeypatch):
    """An issue the registrar does not list yet gets nothing, not a guess —
    naming the wrong company is worse than naming none."""
    _patch(monkeypatch)
    rows = [{"slug": "unknown", "name": "Some Other Company Limited"}]
    existing = {"unknown": {"registrar": "Bigshare Services Private Limited"}}
    assert handoff.fetch(rows, existing) == {}
