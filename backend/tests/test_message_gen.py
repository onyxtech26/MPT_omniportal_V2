"""Guards for the WhatsApp message's product grouping, on synthetic data only.

Covers the defect the manager reported on 2026-09-03: under GPL, "Seiko" and
"Seiko Wall Clock" were reported as one line. SEI-WC was a member of the Seiko
display group, so wall clocks were summed into the watch line.

That merge hid a real event. In GPL's July 2026 figures the branch sold no
Seiko watches at all, yet the combined line read "Seiko ... 1.1k 2026 sales =
4pcs" because four wall clocks were folded in -- reporting a watch business
that had stopped as merely down. Wall clocks are high-volume/low-value, so
they also dominate the piece counts they are merged into.
"""
import pandas as pd
import pytest

from agenda.message_gen import CATEGORY_GROUPS, CATEGORY_NAMES, generate_message


def _frame(rows):
    """Minimal POS-shaped frame: (branch, month, category, qty, amt, cost)."""
    df = pd.DataFrame(
        [{"com_unit": b, "trx_date": f"15/{m:02d}/2025 00:00:00", "inv_category": c,
          "trx_mode": "D", "trx_qty": q, "trx_amt": a, "cost_amt": k}
         for b, m, c, q, a, k in rows]
    )
    df["_date"] = pd.to_datetime(df["trx_date"], format="%d/%m/%Y %H:%M:%S")
    df["_month"] = df["_date"].dt.month
    return df


def test_wall_clocks_are_not_in_the_seiko_group():
    assert "SEI-WC" not in CATEGORY_GROUPS["Seiko"], (
        "SEI-WC is a wall clock; merging it into the Seiko watch line was the "
        "2026-09-03 defect"
    )
    # The watch sub-brands stay merged -- only the clock was split out.
    assert CATEGORY_GROUPS["Seiko"] == {"SEI", "SEI-5", "SEI-SP5"}


def test_seiko_wall_clock_has_its_own_display_name():
    assert CATEGORY_NAMES["SEI-WC"] == "Seiko Wall Clock"


@pytest.mark.parametrize("code", ["CR-WC", "OH-WC", "TSO-WC", "SEI-WC", "SEI-AC"])
def test_no_clock_is_merged_into_any_product_group(code):
    """Every clock reports standalone, which is what makes SEI-WC consistent."""
    grouped = {c for members in CATEGORY_GROUPS.values() for c in members}
    assert code not in grouped, f"{code} is a clock and should report on its own"


def test_watches_and_wall_clocks_report_as_separate_lines():
    """The reported case: watches gone to zero, wall clocks up.

    Merged, this printed one line implying watches still sold 4 units. Split,
    the watch line must show it dropped out and the clock line must stand alone.
    """
    # Mirrors GPL July: 7 watches + 1 clock in 2025, only 4 clocks in 2026.
    # The quantities are deliberately distinct so "4pcs" can only refer to the
    # clocks -- that is what makes the last assertion meaningful.
    df25 = _frame([("GPL", 7, "SEI",    7, 6508.0, 3000.0),
                   ("GPL", 7, "SEI-WC", 1,  177.0,   90.0)])
    df26 = _frame([("GPL", 7, "SEI-WC", 4, 1064.0,  500.0)])

    msg = generate_message("GPL", 7, df25, df26)

    assert "Seiko Wall Clock" in msg, "the clock needs its own line"
    # The watch line must report the business stopping, not a partial dip.
    watch_lines = [l for l in msg.splitlines()
                   if l.startswith("Seiko ") and "Wall Clock" not in l]
    assert watch_lines, "expected a standalone Seiko watch line"
    assert "dropped out" in watch_lines[0], watch_lines[0]
    assert "7pcs" in watch_lines[0], "watch line reports its own 2025 quantity"
    # The clocks' 4 units must never be attributed to the watch line.
    assert "4pcs" not in watch_lines[0], watch_lines[0]
