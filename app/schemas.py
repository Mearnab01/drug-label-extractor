
FIELDS = [
    ("drug_name", "Drug name", "pill", "Medication name as printed (brand or generic). Empty if not printed."),
    ("strength", "Strength", "flask-conical", "Dose strength, e.g. '50 mcg', '5 mg'."),
    ("dosage_form", "Dosage form", "package", "tablet, capsule, solution, etc."),
    ("directions", "Directions", "clipboard-list", "The patient instructions (sig), as one sentence."),
    ("quantity", "Quantity", "hash", "Quantity dispensed, number only with unit if printed."),
    ("refills", "Refills", "repeat", "Refill information, e.g. 'No refills' or '4 refills by 12-01-2017'."),
    ("date_filled", "Date filled", "calendar", "Date the prescription was filled."),
    ("discard_after", "Discard after", "calendar-x", "Expiry / discard-after date."),
    ("pharmacy", "Pharmacy", "building-2", "Pharmacy name."),
    ("prescriber", "Prescriber", "stethoscope", "Prescribing doctor."),
    ("patient", "Patient", "user", "Patient name."),
    ("rx_number", "Rx number", "file-text", "Prescription number (digits after Rx#)."),
]

FIELD_KEYS = [f[0] for f in FIELDS]
FIELD_META = {k: {"label": l, "icon": i, "hint": h} for k, l, i, h in FIELDS}
