"""
Current Date Utility
Provides the current date in various formats for the LLM to use.
"""

from datetime import datetime, timezone
from zoneinfo import ZoneInfo

# Use UTC for consistency
_UTC = timezone.utc

def get_current_date() -> str:
    """
    Get current date in ISO format (YYYY-MM-DD)
    """
    return datetime.now(_UTC).strftime("%Y-%m-%d")

def get_current_datetime() -> str:
    """
    Get current date and time in ISO format (YYYY-MM-DD HH:MM:SS)
    """
    return datetime.now(_UTC).strftime("%Y-%m-%d %H:%M:%S")

def get_current_time() -> str:
    """
    Get current time in 24-hour format (HH:MM:SS)
    """
    return datetime.now(_UTC).strftime("%H:%M:%S")

def get_current_date_formatted() -> str:
    """
    Get current date in a human-readable format (Monday, January 1, 2026)
    """
    return datetime.now(_UTC).strftime("%A, %B %d, %Y")

def get_current_year() -> str:
    """
    Get current year
    """
    return datetime.now(_UTC).strftime("%Y")

def get_current_month() -> str:
    """
    Get current month and year
    """
    return datetime.now(_UTC).strftime("%B %Y")

def get_current_day_of_week() -> str:
    """
    Get current day of the week
    """
    return datetime.now(_UTC).strftime("%A")

def get_current_day_of_month() -> str:
    """
    Get current day of the month
    """
    return datetime.now(_UTC).strftime("%d")

def get_current_week_number() -> str:
    """
    Get current week number
    """
    return datetime.now(_UTC).strftime("%W")

def get_current_quarter() -> str:
    """
    Get current quarter (Q1, Q2, Q3, Q4)
    """
    month = datetime.now(_UTC).month
    return f"Q{((month - 1) // 3) + 1}"

def get_current_fiscal_year() -> str:
    """
    Get current fiscal year (e.g., FY2026)
    """
    year = datetime.now(_UTC).year
    if datetime.now(_UTC).month >= 4:  # April is start of fiscal year
        return f"FY{year + 1}"
    return f"FY{year}"

def get_current_season() -> str:
    """
    Get current season
    """
    month = datetime.now(_UTC).month
    if month in [12, 1, 2]:
        return "Winter"
    elif month in [3, 4, 5]:
        return "Spring"
    elif month in [6, 7, 8]:
        return "Summer"
    else:
        return "Autumn"

def get_current_date_info() -> dict:
    """
    Get all current date information in a dictionary
    """
    return {
        "date": get_current_date(),
        "datetime": get_current_datetime(),
        "time": get_current_time(),
        "formatted_date": get_current_date_formatted(),
        "year": get_current_year(),
        "month": get_current_month(),
        "day_of_week": get_current_day_of_week(),
        "day_of_month": get_current_day_of_month(),
        "week_number": get_current_week_number(),
        "quarter": get_current_quarter(),
        "fiscal_year": get_current_fiscal_year(),
        "season": get_current_season(),
    }

def format_current_date_for_llm() -> str:
    """
    Format current date information in a way that's easy for the LLM to use
    """
    info = get_current_date_info()
    return f"""
━━━━ CURRENT DATE INFORMATION ━━━━
- Today's date: {info['formatted_date']} ({info['date']})
- Year: {info['year']}
- Quarter: {info['quarter']}
- Fiscal Year: {info['fiscal_year']}
- Season: {info['season']}
- Week: {info['week_number']}
- Day: {info['day_of_week']}, {info['day_of_month']}

Use this information to provide accurate, up-to-date responses.
Do not hallucinate dates or events that have not occurred yet.
Do not reference events that have already occurred.
"""

# Export functions for easy importing
__all__ = [
    "get_current_date",
    "get_current_datetime",
    "get_current_time",
    "get_current_date_formatted",
    "get_current_year",
    "get_current_month",
    "get_current_day_of_week",
    "get_current_day_of_month",
    "get_current_week_number",
    "get_current_quarter",
    "get_current_fiscal_year",
    "get_current_season",
    "get_current_date_info",
    "format_current_date_for_llm",
]
