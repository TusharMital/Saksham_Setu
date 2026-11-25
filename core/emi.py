"""EMI and amortization. r is monthly rate = annual / 12 / 100."""


def calculate_emi(principal, annual_rate, tenure_months, moratorium_months=0):
    p = float(principal)
    n_total = int(tenure_months)
    moratorium = max(0, int(moratorium_months or 0))
    n = max(1, n_total - moratorium)
    r = float(annual_rate) / 12.0 / 100.0

    p_after_moratorium = p * ((1 + r) ** moratorium) if moratorium > 0 else p

    if r == 0:
        emi = p_after_moratorium / n
    else:
        factor = (1 + r) ** n
        emi = p_after_moratorium * r * factor / (factor - 1)

    schedule = []
    balance = p
    total_interest = 0.0

    for month in range(1, n_total + 1):
        if month <= moratorium:
            interest = balance * r
            principal_paid = 0.0
            payment = 0.0
            total_interest += interest
            balance += interest
            note = "Moratorium — interest added, no EMI"
        else:
            interest = balance * r
            if month == n_total:
                principal_paid = balance
                payment = principal_paid + interest
            else:
                principal_paid = min(emi - interest, balance)
                payment = emi
            total_interest += interest
            balance = max(0.0, balance - principal_paid)
            note = ""
        schedule.append(
            {
                "month": month,
                "emi": round(payment, 2),
                "principal": round(principal_paid, 2),
                "interest": round(interest, 2),
                "balance": round(balance, 2),
                "note": note,
            }
        )

    emi_rounded = round(emi, 2)
    total_interest = round(total_interest, 2)
    total_payable = round(p + total_interest, 2)
    return {
        "principal": round(p, 2),
        "annual_rate": float(annual_rate),
        "tenure_months": n_total,
        "moratorium_months": moratorium,
        "monthly_emi": emi_rounded,
        "total_interest": total_interest,
        "total_payable": total_payable,
        "schedule": schedule,
    }
