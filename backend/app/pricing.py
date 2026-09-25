"""Canonical billing pricing (INR). Source of truth for sign-off charges."""

# Center charges (diagnostic center is billed)
CENTER_FIRST_STUDY_INR = 30
CENTER_ADDITIONAL_STUDY_INR = 15

# Doctor payouts (radiologist is paid)
DOCTOR_FIRST_STUDY_INR = 20
DOCTOR_ADDITIONAL_STUDY_INR = 10

CURRENCY = "INR"

# Study modalities accepted on upload / studies (not template category labels)
ALLOWED_STUDY_MODALITIES = (
    "X-Ray",
    "CT",
    "MRI",
    "Sonography",
    "Blood Report",
)

# Last-resort default when client omits modality (legacy callers). Prefer explicit client value.
DEFAULT_STUDY_MODALITY = "X-Ray"


def center_amount_for_study_index(index_one_based: int) -> int:
    """index_one_based: 1 = first study in the case, 2+ = additional."""
    if index_one_based <= 1:
        return CENTER_FIRST_STUDY_INR
    return CENTER_ADDITIONAL_STUDY_INR


def doctor_amount_for_study_index(index_one_based: int) -> int:
    if index_one_based <= 1:
        return DOCTOR_FIRST_STUDY_INR
    return DOCTOR_ADDITIONAL_STUDY_INR


def center_total_for_study_count(n: int) -> int:
    if n <= 0:
        return 0
    return CENTER_FIRST_STUDY_INR + CENTER_ADDITIONAL_STUDY_INR * (n - 1)


def doctor_total_for_study_count(n: int) -> int:
    if n <= 0:
        return 0
    return DOCTOR_FIRST_STUDY_INR + DOCTOR_ADDITIONAL_STUDY_INR * (n - 1)


def pricing_public_dict() -> dict:
    return {
        "currency": CURRENCY,
        "center": {
            "firstStudy": CENTER_FIRST_STUDY_INR,
            "additionalStudy": CENTER_ADDITIONAL_STUDY_INR,
        },
        "doctor": {
            "firstStudy": DOCTOR_FIRST_STUDY_INR,
            "additionalStudy": DOCTOR_ADDITIONAL_STUDY_INR,
        },
        "allowedModalities": list(ALLOWED_STUDY_MODALITIES),
    }
