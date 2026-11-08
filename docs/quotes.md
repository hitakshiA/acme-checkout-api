# /v1/pricing/quote

- input: plan, interval, optional from_plan and used_days
- output: price, proration (charge/credit), tax line
- rounding: half-up to the cent, same as invoices
- the pricing page must never compute money itself
