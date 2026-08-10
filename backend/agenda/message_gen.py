"""Generate the WhatsApp-style branch performance message for the manager.

Format mirrors the manual message the manager sends to the boss each month:
header → total sales comparison → product breakdown → profit summary.
"""
from __future__ import annotations
import calendar
from .engine import branch_figures, product_breakdown

# Display names for inv_category codes. Descriptions are taken verbatim from
# the POS "Sales Profit Report - By Product Group (Detail)" printout, so a code
# added here should be checked against that report rather than guessed.
CATEGORY_NAMES: dict[str, str] = {
    "AB":       "Alba",
    "AD":       "Alain Delon",
    "AE":       "Alexandre Christie",
    "BAT-CLK":  "Battery (Clock)",
    "BGT":      "Bigotti",
    "BN":       "Bonia",
    "BUM":      "Bum",
    "BUM-EQ":   "Bum Equipment",
    "CA":       "Cluse Accessories",
    "CAS":      "Casio",
    "CAS-BG":   "Baby G",
    "CAS-CTE":  "Edifice",
    "CAS-GS":   "G-Shock",
    "CAES":     "Caesar",
    "CK":       "Calvin Klein",
    "CLJ":      "Charles Jourdan",
    "CM":       "Camel",
    "CR-AC":    "Crocodile Alarm Clock",
    "CR-WC":    "Crocodile Wall Clock",
    "CT":       "Chronotech",
    "CTL":      "Citole",
    "DGT":      "Digitec Watch",
    "DIS":      "Disney",
    "DK":       "Daniel Klein",
    "DW":       "Daniel Wellington",
    "ECOD":     "Eco Drive",
    "FG":       "Free Gift",
    "FOS":      "Fossil",
    "GAR":      "Garmin",
    "GUE":      "Guess",
    "HAM":      "Hamilton",
    "HKW":      "HK Watch",
    "JBV":      "J. Bovier",
    "JTW":      "JT Warriors",
    "LM":       "Luminox",
    "LONG":     "Longines",
    "LS":       "Leather Strap",
    "MF":       "Mini Focus",
    "MH":       "Michel Herbelin",
    "MID":      "Mido",
    "MK":       "Michael Kors",
    "NAV":      "Naviforce",
    "OH":       "Deposit/EP",
    "OH-AC":    "Other Alarm Clock",
    "OH-W":     "Other Watch",
    "OH-WC":    "Other Wall Clock",
    "OT":       "Repair Deposit",
    "PIN":      "Pin",
    "PS":       "PVC Strap",
    "Q&Q":      "Q&Q Watch",
    "R-BAT":    "Renata Battery",
    "RAD":      "Rado",
    "RE":       "R&E",
    "REE":      "Reebok",
    "RW":       "Rewards Watch",
    "S-BAT":    "Sony Battery",
    "SBP":      "S.B. Polo",
    "SEI":      "Seiko",
    "SEI-5":    "Seiko 5",
    "SEI-AC":   "Seiko Alarm Clock",
    "SEI-SP5":  "Seiko Sports 5",
    "SEI-WC":   "Seiko Wall Clock",
    "SER":      "Service",
    "SKC":      "Skechers",
    "SLO":      "Slo/Pokemon",
    "SLO-AC":   "Slo Alarm Clock",
    "SP":       "Spare Parts",
    "SSS":      "Stainless Strap",
    "SUB":      "Submarine",
    "TBL":      "Timberland",
    "TF":       "Trofish",
    "TIS":      "Tissot",
    "TSO-WC":   "Telesonic Wall Clock",
    "VSA":      "Victorinox Swiss Army",
    "WMB":      "Tokei Mystery Box",
}

# Categories merged into a single display group
CATEGORY_GROUPS: dict[str, set[str]] = {
    "Seiko":                  {"SEI", "SEI-5", "SEI-SP5", "SEI-WC"},
    "🔋 Sony + Renata battery": {"S-BAT", "R-BAT"},
}

# Lines the manager hand-totals on the printed report every month — exempt
# from the min-variance threshold so they always appear, however small the
# movement (verified against his handwritten July totals: JCI 693/19,805
# vs 692/19,585, a -RM220 change the threshold used to hide).
ALWAYS_SHOW: set[str] = {"🔋 Sony + Renata battery"}

# Categories excluded from the product breakdown (operational / non-product)
SKIP_CATEGORIES: set[str] = {"SER", "FG", "SP"}

# Deposit accounts reported as labelled summary lines (no qty) rather than
# product rows, each shown only when it moves by >= min_variance_rm. These are
# money held/refunded, not merchandise — but they are inside the branch sales
# totals (both the POS printout's and this message's headline), so a large
# swing must be surfaced or the "Mainly due to" list cannot add up to the
# headline (JCI July 2026: OT fell RM21,246 = 30% of the branch's decline).
DEPOSIT_LINES: dict[str, set[str]] = {
    "Deposit collection":          {"OH"},
    "Repair/reservation deposits": {"OT"},
}
DEPOSIT_CATEGORIES: set[str] = set().union(*DEPOSIT_LINES.values())


def _fmt_k(amount: float) -> str:
    """Format a RM amount as e.g. '29k' or '29.3k'."""
    k = abs(amount) / 1000
    return f"{k:.0f}k" if k == int(k) else f"{k:.1f}k"


def _merge_groups(raw: dict[str, dict]) -> list[dict]:
    """Collapse individual categories into their display groups, return sorted list."""
    merged: dict[str, dict] = {}

    # Apply groups first
    for group_name, members in CATEGORY_GROUPS.items():
        cats_present = [c for c in members if c in raw]
        if not cats_present:
            continue
        merged[group_name] = {
            "name":    group_name,
            "sales25": sum(raw[c]["sales"] for c in cats_present),
            "qty25":   sum(raw[c]["qty"]   for c in cats_present),
            "sales26": 0.0, "qty26": 0.0,  # filled in second pass
        }

    # Individual categories not in any group
    grouped_cats = {c for members in CATEGORY_GROUPS.values() for c in members}
    for cat, data in raw.items():
        if cat in grouped_cats or cat in SKIP_CATEGORIES:
            continue
        name = CATEGORY_NAMES.get(cat, cat)
        if name not in merged:
            merged[name] = {"name": name, "sales25": 0.0, "qty25": 0.0,
                            "sales26": 0.0, "qty26": 0.0}
        merged[name]["sales25"] += data["sales"]
        merged[name]["qty25"]   += data["qty"]

    return merged


def _build_combined(bd25: dict, bd26: dict) -> list[dict]:
    """Merge two product_breakdown dicts (FY25 + FY26) into one display list."""
    # Collect all categories from both years (exclude operational + deposit cats)
    all_cats = (set(bd25.keys()) | set(bd26.keys())) - SKIP_CATEGORIES - DEPOSIT_CATEGORIES
    raw_both: dict[str, dict] = {}
    for cat in all_cats:
        raw_both[cat] = {
            "sales": bd25.get(cat, {}).get("sales", 0.0),
            "qty":   bd25.get(cat, {}).get("qty",   0.0),
        }

    # Build FY25 side using merge logic
    merged25 = _merge_groups(raw_both)

    # Rebuild for FY26
    raw26: dict[str, dict] = {}
    for cat in all_cats:
        raw26[cat] = {
            "sales": bd26.get(cat, {}).get("sales", 0.0),
            "qty":   bd26.get(cat, {}).get("qty",   0.0),
        }
    merged26 = _merge_groups(raw26)

    # Join
    all_names = set(merged25.keys()) | set(merged26.keys())
    result = []
    for name in all_names:
        s25 = merged25.get(name, {}).get("sales25", 0.0)
        q25 = merged25.get(name, {}).get("qty25",   0.0)
        s26 = merged26.get(name, {}).get("sales25", 0.0)  # stored as sales25 key
        q26 = merged26.get(name, {}).get("qty25",   0.0)
        result.append({
            "name": name,
            "sales25": s25, "qty25": int(round(q25)),
            "sales26": s26, "qty26": int(round(q26)),
            "variance": round(s26 - s25, 2),
        })

    # Sort: biggest drop first, then biggest gain last
    result.sort(key=lambda x: x["variance"])
    return result


def generate_message(
    branch: str,
    month: int,
    df25,
    df26,
    acc_margin25: float | None = None,
    min_variance_rm: float = 500.0,
) -> str:
    """Return the formatted WhatsApp message string.

    branch          : e.g. 'JCI'
    month           : 1-12
    df25            : DataFrame from load_report_csv (FY25 monthly CSV)
    df26            : DataFrame from load_report_csv (FY26 Jan-month CSV)
    acc_margin25    : FY25 accumulated margin (float 0-1), used only if available
    min_variance_rm : hide product lines with |variance| < this threshold
    """
    month_name = calendar.month_name[month].upper()
    months = [month]

    m25 = branch_figures(df25, branch, months)
    m26 = branch_figures(df26, branch, months) if df26 is not None else None

    sales25 = m25["sales"]

    # When no FY26 data is available, emit a FY25-only summary.
    if m26 is None:
        lines: list[str] = [
            f"Outlets: {branch} {month_name}",
            "2025 Summary (2026 data awaiting)",
            "",
            "2025 Sales",
            f"RM{sales25:,.2f}",
            "",
            f"Profit {m25['margin'] * 100:.2f}%",
        ]
        return "\n".join(lines)

    sales26 = m26["sales"]
    var_sales = round(sales26 - sales25, 2)
    direction = "Decreased 📉" if var_sales < 0 else "Increased 📈"
    var_str = (f"(RM{abs(var_sales):,.0f})" if var_sales < 0
               else f"+RM{var_sales:,.0f}")

    lines: list[str] = [
        f"Outlets: {branch} {month_name}",
        "2025 🆚 2026",
        "",
        "2025 Sales",
        f"RM{sales25:,.2f}",
        "🆚",
        f"2026 Sales RM{sales26:,.2f}",
        f"{direction} by {var_str}",
        "",
        "Mainly due to:",
        "",
    ]

    # Product breakdown
    if df26 is not None:
        bd25 = product_breakdown(df25, branch, months)
        bd26 = product_breakdown(df26, branch, months)

        # Deposit lines — shown first, no qty, special labels
        for dep_label, dep_cats in DEPOSIT_LINES.items():
            dep25 = sum(bd25.get(c, {}).get("sales", 0.0) for c in dep_cats)
            dep26 = sum(bd26.get(c, {}).get("sales", 0.0) for c in dep_cats)
            dep_var = round(dep26 - dep25, 2)
            if abs(dep_var) < min_variance_rm:
                continue
            dep_dir  = "increased" if dep_var >= 0 else "decreased"
            dep_sign = "+" if dep_var >= 0 else "-"
            lines.append(
                f"{dep_label} {dep_dir} by "
                f"{dep_sign}RM{abs(dep_var):,.2f}"
            )
            lines.append("")

        items = _build_combined(bd25, bd26)

        for item in items:
            name  = item["name"].upper() if item["name"].isupper() else item["name"]
            v     = item["variance"]
            s26   = item["sales26"]
            s25   = item["sales25"]
            q26   = item["qty26"]
            q25   = item["qty25"]

            # Nothing traded in either year. Guarding this first is what keeps
            # zero-revenue rows (placeholder categories, clock batteries booked
            # at RM0) out of the variance branch below, where the absent
            # movement would otherwise print as "increased by +RM0".
            if s25 == 0 and s26 == 0:
                continue
            # Skip tiny movements between two present years
            if (item["name"] not in ALWAYS_SHOW
                    and abs(v) < min_variance_rm and s25 != 0 and s26 != 0):
                continue
            # Skip return/correction artifacts. A negative quantity or negative
            # net revenue in either year is a POS adjustment rather than a
            # brand's performance, and _fmt_k would strip the sign and report a
            # refund as if it were lost sales.
            if q25 < 0 or q26 < 0 or s25 < 0 or s26 < 0:
                continue

            if s25 == 0 and s26 > 0:
                lines.append(f"{name} achieved RM{s26:,.2f} = {q26}pcs")
                lines.append("")
            elif s25 != 0 and s26 == 0:
                lines.append(
                    f"{name} dropped out 📉 (2025: {_fmt_k(s25)} = {q25}pcs)"
                )
                lines.append("")
            else:
                emoji = "📉" if v < 0 else "📈"
                word  = "dropped" if v < 0 else "increased"
                sign  = "" if v < 0 else "+"
                lines.append(
                    f"{name} {word} {emoji} by {sign}RM{abs(v):,.0f} / {q26}pcs"
                )
                lines.append(f"{_fmt_k(s26)} 2026 sales = {q26}pcs")
                lines.append(f"{_fmt_k(s25)} 2025 sales = {q25}pcs")
                lines.append("")

    # Profit footer
    margin26 = m26["margin"]
    margin25 = m25["margin"]
    m_diff   = round((margin26 - margin25) * 100, 2)
    m_dir    = "increased" if m_diff >= 0 else "decreased"
    sign     = "+" if m_diff >= 0 else ""
    lines.append(f"Profit {margin26 * 100:.2f}%")
    lines.append(
        f"Compared to last year, {m_dir} by {sign}{m_diff:.2f}%"
    )

    return "\n".join(lines)
