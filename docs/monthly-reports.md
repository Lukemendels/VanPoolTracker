# Monthly estimated reports

The Node runner prepares the original editable Excel workbook as an **estimated draft** for a colleague to review. It does not send email, submit a final report, install a schedule, or use the address printed in the template as a recipient.

## Generate a draft

Use Node 24 (`.nvmrc` pins the tested patch version), then run `npm ci`.

Create a private JSON file **outside this repository**, replacing the placeholder with the month's actual starting odometer reading:

```json
{
  "month": "2026-10",
  "startingMileage": null
}
```

`null` is intentionally invalid. A starting reading is required every month. Zero is a valid explicitly supplied reading; omitted, blank, string, fractional, negative, and unknown values fail instead of inventing mileage or carrying forward an estimate. An optional numeric `endingMileage` overrides the calculated ending reading, as in the app; it cannot be less than the starting reading. An optional nonempty `seed` creates an intentional alternative attendance draft.

```sh
npm run report -- \
  --input /private/vanpool/inputs/2026-10.json \
  --output /private/vanpool/reports/2026-10
```

Use paths appropriate to the private runtime. The output directory must not already exist for a new run. It will contain the estimated `.xlsx` and `manifest.json`. The manifest records inputs, seed, generated daily codes, calculation summary, generator/Node versions, and hashes. It is private monthly data too. The workbook keeps its three sheets and editable form, with an estimated-draft title. The other two template tabs are preserved unchanged, including their existing placeholder content; they are not newly verified roster or route data.

## Shared app logic

The browser and CLI use the same roster, calendar, seeding algorithm, mileage calculation, and workbook builder:

- Weekends and the app's observed US federal holidays are NR days
- Each active commute day adds 90 miles, independent of passenger absences
- Drivers rotate through the configured driver list
- The original algorithm selects one or two random absences per rider with its existing random-comparator shuffle
- The original backup-driver choice and ordering remain unchanged. A backup assignment can override a previously seeded absence; the draft is intended for human adjustment
- AM/PM status codes retain the app's D, R, X, NR, and PV meanings

The CLI supplies seeded randomness; the browser's Seed button still requests a fresh random draft. Pin Node when regenerating a draft from inputs because the original random-comparator sort can depend on the JavaScript engine. Routine retries reuse the saved workbook and do not rerun randomness. Calendar keys now use civil dates rather than UTC conversion, avoiding shifted holidays in positive-offset timezones.

The exporter now writes rider labels and status cells from one roster. Justin's added row no longer shifts everyone else's data under old names. All seven rider rows are styled. Four-week months clear every unused fifth-week date and status cell. Six-week months add a matching block and preserve the footer.

## Safe retries and edits

- A per-destination lock prevents overlapping generation
- Workbook and manifest are prepared in a private staging directory and published together
- A successful retry with the same input and template returns `existing`, reusing the original bytes
- Changed inputs/template/version, a colleague-edited workbook, incomplete output directories, and active locks stop with an error rather than overwrite a report
- For an intentional revision, use a new private output directory. Keep the same seed to keep the same attendance estimates
- If interrupted, inspect the process before removing a stale lock; do not automatically break a lock or delete output

The runtime creates new report directories with mode 0700 and files with mode 0600. Keep their existing parent directories and backups private too. Monthly inputs, reports, recipient addresses, delivery state, and credentials must never be committed, placed in `public/`, published to Pages, or uploaded to public CI artifacts. The runner rejects paths inside the checkout, including symlink destinations. `.gitignore` is only a second layer of protection; it is not access control. The existing template remains a public repository asset, unchanged.

## Schedule and delivery integration

Calculate the target date without mileage:

```sh
npm run report -- --send-date 2026-10
# 2026-10-28
```

The rule is **three business days strictly before the last calendar day of the month**, skipping weekends and the same observed holiday calendar used by the app. The last day itself is excluded, including when it is a weekend or holiday. October 2026 ends on Saturday, October 31, so the target is Wednesday, October 28. The October estimate is 21 commute days and 1,890 miles before an ending override.

A private scheduler should:

1. Ask for the starting odometer reading at the start of each month, and associate the reply with that exact reporting month
2. Evaluate the target date in the user's confirmed IANA timezone and chosen send time. A daily scheduled date check can handle varying months and holidays; a fixed day-of-month cron cannot express this rule
3. On the target date, require a known monthly reading, an approved recipient, and authorized email access. If anything is missing, notify the user and do not guess or send
4. Generate/reuse this draft in private persistent storage. Report generation is not evidence of email delivery
5. Before sending, check a separate private sent marker keyed by month and recipient. Keep any provider message ID and workbook hash. Write a sent marker only after confirmed delivery acceptance
6. If a send times out with uncertain outcome, query the provider's sent-mail history using a unique report/message identifier before retrying. A file marker alone cannot provide exactly-once email delivery
7. If the scheduled run is missed, catch up only within an explicitly chosen window. Do not silently send stale reports after the reporting period or resend a month to a new recipient

No recipient, SMTP setup, OAuth token, credentials, or live schedule is part of this code change. Do not add GitHub Actions cron for private monthly reports: it cannot read the user's private conversation inputs. Keep scheduling/reminders and email delivery in the authorized private assistant runtime. Do not send to the template's printed final-submission address unless separately instructed.

## Checks

```sh
npm test
npm run lint
npm run build
```

Tests cover four-, five-, and six-week XLSX round trips, all seven labels and their AM/PM codes, unused-date clearing, all three sheets, editable cells, holidays, timezones, mileage overrides, required/invalid inputs, reproducible seeds, and retry/non-overwrite behavior. The workbook is a draft with editable values; it does not claim Excel formulas will recalculate mileage after manual attendance edits.
