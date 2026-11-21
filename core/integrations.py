"""Named stubs so DigiLocker, Bhashini, bank feeds and SMS OTP can be swapped later."""


def mock_digilocker_fetch(document_type, aadhaar_last4="0000"):
    return {
        "provider": "mock_digilocker",
        "document_type": document_type,
        "status": "verified_demo",
        "holder": "Demo Applicant",
        "aadhaar_last4": aadhaar_last4,
        "notice": "Demo data. Verify with the official partner.",
    }


def mock_bhashini_translate(text, target="hi"):
    return {
        "provider": "mock_bhashini",
        "target": target,
        "text": text,
        "notice": "Translation stub. Plug in Bhashini later.",
    }


def mock_bank_fund_feed(branch_name):
    return {
        "provider": "mock_bank_fund_feed",
        "branch": branch_name,
        "live": False,
        "notice": "Fund quota is demo data, not a live bank feed.",
    }


def mock_sms_otp_send(mobile):
    return {
        "provider": "mock_sms_otp",
        "mobile": mobile,
        "otp": "123456",
        "message": "Demo OTP is 123456. No SMS was sent.",
    }


def mock_sms_otp_verify(otp):
    code = str(otp or "").strip()
    return {"verified": code.isdigit() and len(code) == 6, "notice": "Demo OTP check only."}
