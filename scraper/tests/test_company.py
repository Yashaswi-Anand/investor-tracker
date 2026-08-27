"""Unit tests for sources/company.py — the company-detail parsing.

These guard the two things that actually went wrong while writing it: an
unresolved "$26" reference being stored as though it were the company
description, and a declared chunk length being counted in characters when the
source declares it in bytes (which truncates every page containing a rupee
sign).
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sources import company  # noqa: E402


# --------------------------------------------------------------------------
# Flight-chunk resolution
# --------------------------------------------------------------------------
def _flight(records):
    """Build a flight stream the way the source page writes one."""
    return "\n".join(f"{key}:{value}" for key, value in records)


def test_resolve_follows_a_reference_to_its_text():
    body = "Incorporated in December 1978, Hy-Tech Engineers Limited is an engineer."
    flight = _flight([("26", f"T{len(body.encode()):x},{body}"), ("27", "T4,tail")])
    assert company.resolve("$26", flight, company.chunk_index(flight)) == body


def test_resolve_measures_the_declared_length_in_bytes():
    # The rupee sign is three bytes and one character. Counting characters
    # overruns the record and swallows the start of the next one.
    body = "Revenue of ₹193.44 crore in FY26."
    assert len(body.encode()) != len(body)
    flight = _flight([("26", f"T{len(body.encode()):x},{body}"), ("27", "T5,NEXT!")])
    assert company.resolve("$26", flight, company.chunk_index(flight)) == body


def test_resolve_returns_none_when_the_reference_is_absent():
    # Some references are loaded lazily and never appear in the server
    # response. Returning the literal "$26" would print it on the page as
    # though it were the company description.
    flight = _flight([("27", "T4,tail")])
    assert company.resolve("$26", flight, company.chunk_index(flight)) is None


def test_resolve_passes_plain_values_straight_through():
    flight = _flight([("26", "T4,tail")])
    offsets = company.chunk_index(flight)
    assert company.resolve("Pharmaceuticals", flight, offsets) == "Pharmaceuticals"
    assert company.resolve(None, flight, offsets) is None


def test_chunk_index_ignores_ids_that_are_not_at_a_record_boundary():
    # "12:30" inside a body is a time, not a record header.
    flight = "26:T15,open at 12:30 pm\n27:T4,tail"
    assert set(company.chunk_index(flight)) == {"26", "27"}


# --------------------------------------------------------------------------
# Financials
# --------------------------------------------------------------------------
FINANCIALS_HTML = """
  <table>
    <tr><th>Period Ended</th><th>31 Mar 2026</th><th>31 Mar 2025</th><th>31 Mar 2024</th></tr>
    <tr><td>Assets</td><td>175.71</td><td>170.65</td><td>146.24</td></tr>
    <tr><td>Total Income</td><td>193.44</td><td>166.71</td><td>141.17</td></tr>
    <tr><td>Profit After Tax</td><td>22.59</td><td>19.62</td><td>11.60</td></tr>
    <tr><td>Net Worth</td><td>122.02</td><td>101.25</td><td>82.22</td></tr>
    <tr><td>Something We Do Not Track</td><td>1</td><td>2</td><td>3</td></tr>
  </table>
"""


def test_parse_financials_reads_periods_and_rows():
    parsed = company.parse_financials(FINANCIALS_HTML)
    assert parsed["periods"] == ["31 Mar 2026", "31 Mar 2025", "31 Mar 2024"]
    assert parsed["rows"]["revenue"] == [193.44, 166.71, 141.17]
    assert parsed["rows"]["profit"] == [22.59, 19.62, 11.60]
    assert parsed["unit"] == "cr"
    # Rows we have no column for are dropped rather than stored under their
    # source wording, so the shape the page renders stays predictable.
    assert set(parsed["rows"]) == {"assets", "revenue", "profit", "net_worth"}


def test_parse_financials_survives_the_page_escaping_its_markup():
    escaped = FINANCIALS_HTML.replace("<", "\\u003c").replace(">", "\\u003e")
    assert company.parse_financials(escaped)["rows"]["revenue"] == [
        193.44,
        166.71,
        141.17,
    ]


def test_parse_financials_keeps_a_missing_figure_distinct_from_zero():
    html = """
      <table>
        <tr><th>Period Ended</th><th>31 Mar 2026</th><th>31 Mar 2025</th></tr>
        <tr><td>Total Income</td><td>193.44</td><td>-</td></tr>
      </table>
    """
    assert company.parse_financials(html)["rows"]["revenue"] == [193.44, None]


def test_parse_financials_never_shifts_a_figure_onto_the_wrong_year():
    # A trailing footer cell must not push values off by one period.
    html = """
      <table>
        <tr><th>Period Ended</th><th>31 Mar 2026</th><th>31 Mar 2025</th></tr>
        <tr><td>Total Income</td><td>193.44</td><td>166.71</td><td>audited</td></tr>
      </table>
    """
    parsed = company.parse_financials(html)
    assert len(parsed["rows"]["revenue"]) == len(parsed["periods"]) == 2
    assert parsed["rows"]["revenue"] == [193.44, 166.71]


def test_parse_financials_returns_none_when_there_is_no_table():
    assert company.parse_financials("<p>No financials published yet.</p>") is None


# --------------------------------------------------------------------------
# Strengths and risks
# --------------------------------------------------------------------------
def test_parse_highlights_reads_the_bullet_list():
    html = """
      <h2>Competitive Strengths</h2>
      <ul>
        <li>Over four decades of experience in the hydraulics industry.</li>
        <li>A portfolio of more than 11,000 SKUs.</li>
      </ul>
    """
    assert company.parse_highlights(html)["strengths"] == [
        "Over four decades of experience in the hydraulics industry.",
        "A portfolio of more than 11,000 SKUs.",
    ]


def test_parse_highlights_matches_the_sources_misspelling():
    # Some pages publish "Competitve Strengths".
    html = "<h2>Competitve Strengths</h2><ul><li>Long-standing customer base.</li></ul>"
    assert company.parse_highlights(html)["strengths"] == ["Long-standing customer base."]


def test_parse_highlights_does_not_borrow_the_next_sections_bullets():
    # A heading with no list of its own must yield nothing, not the bullets
    # belonging to whatever section follows it.
    html = """
      <h2>Competitive Strengths</h2>
      <p>Refer to the prospectus.</p>
      </ul>
      <h2>Lead Managers</h2>
      <ul><li>Some Capital Advisors Private Limited</li></ul>
    """
    assert (company.parse_highlights(html) or {}).get("strengths") is None


def test_parse_highlights_returns_none_when_nothing_is_published():
    assert company.parse_highlights("<p>Nothing here.</p>") is None
