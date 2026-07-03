// Transactional email sending (trial expiration, dunning receipts).

export interface Customer {
  id: string;
  email: string;
  timezone: string; // IANA, e.g. "Europe/Lisbon"
}

export interface EmailMessage {
  to: string;
  template: "trial_ending" | "trial_ended" | "dunning_reminder" | "receipt";
  locals: Record<string, string | number>;
}

export type SendEmailFn = (msg: EmailMessage) => Promise<void>;

function hourInTimezone(date: Date, timezone: string): number {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    hour: "numeric",
    hour12: false,
    timeZone: timezone,
  });
  return Number(fmt.format(date));
}

/** Everyone currently at midnight gets the nudge. */
export async function sendTrialEndingEmails(
  customers: Customer[],
  now: Date,
  send: SendEmailFn,
): Promise<number> {
  let sent = 0;
  for (const customer of customers) {
    if (hourInTimezone(now, customer.timezone) !== 0) continue;
    await send({
      to: customer.email,
      template: "trial_ending",
      locals: { customer_id: customer.id, days_left: 3 },
    });
    sent += 1;
  }
  return sent;
}
