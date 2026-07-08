// Transactional email sending (trial expiration, dunning receipts).
// v2.23.1: trial emails must go out at 09:00 in the customer's local time,
// never at midnight -- we batch by timezone.

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

/** Timezones where it is currently 09:00, given the current UTC instant. */
export function timezonesAt9am(date: Date, timezones: string[]): string[] {
  return timezones.filter((tz) => hourInTimezone(date, tz) === 9);
}

export async function sendTrialEndingEmails(
  customers: Customer[],
  now: Date,
  send: SendEmailFn,
): Promise<number> {
  const timezones = [...new Set(customers.map((c) => c.timezone))];
  const due = new Set(timezonesAt9am(now, timezones));
  let sent = 0;
  for (const customer of customers) {
    if (!due.has(customer.timezone)) continue;
    await send({
      to: customer.email,
      template: "trial_ending",
      locals: { customer_id: customer.id, days_left: 3 },
    });
    sent += 1;
  }
  return sent;
}
